import nodePath from 'path';
import { parse } from '@babel/parser';
import traverseBabel from '@babel/traverse';
import * as t from '@babel/types';
import fs from 'fs';
import {
	parseFileToAST,
	generateSourceWithMap,
	VITE_PROJECT_ROOT
} from '../utils/ast-utils.js';
import { isSameOriginRequest } from '../utils/same-origin.js';
import { groupEditsByFile, applyElementEdit, renderEditedSource } from './server/source-writer.js';
import {
	EDITABLE_HTML_TAGS,
	INLINE_EDIT_HTML_TAGS,
	checkTagNameEditable,
	validateImageSrc,
	hasMeaningfulTextContent,
	shouldDisableDueToChildren,
	evalChildComposition,
	subtreeRequiresAssistance,
	hasEditableAncestor,
} from './transform/editability.js';
import {
	detectUrlAttribute,
	attachEditAttributes,
	attachAssistedEditId,
} from './transform/inject-attributes.js';

export default function inlineEditPlugin() {
	return {
		name: 'vite-inline-edit-plugin',
		enforce: 'pre',

		transform(code, id) {
			if (!/\.(jsx|tsx)$/.test(id) || !id.startsWith(VITE_PROJECT_ROOT) || id.includes('node_modules')) {
				return null;
			}

			const relativeFilePath = nodePath.relative(VITE_PROJECT_ROOT, id);
			const webRelativeFilePath = relativeFilePath.split(nodePath.sep).join('/');

			try {
				const babelAst = parse(code, {
					sourceType: 'module',
					plugins: ['jsx', 'typescript'],
					errorRecovery: true
				});

				let attributesAdded = 0;

				traverseBabel.default(babelAst, {
					JSXOpeningElement(path) {
						const openingNode = path.node;
						const elementNode = path.parentPath.node;

						if (!openingNode.loc) return;

						const originalLength = openingNode.attributes.length;
						openingNode.attributes = openingNode.attributes.filter(attribute =>
							!(t.isJSXAttribute(attribute) && attribute.name?.name?.startsWith('data-edit-'))
						);
						if (openingNode.attributes.length < originalLength) {
							attributesAdded++;
						}

						const line = openingNode.loc.start.line;
						const column = openingNode.loc.start.column + 1;
						const editId = `${webRelativeFilePath}:${line}:${column}`;

						// Condition 1: an annotated ancestor already owns this subtree. Applies to
						// assisted ids too, so a branch never ends up with nested edit targets.
						if (hasEditableAncestor(path)) return;

						// Condition 2: tags outside the editable list cannot be edited in place,
						// but still qualify for an assisted id when they hold text of their own.
						if (!checkTagNameEditable(openingNode, EDITABLE_HTML_TAGS)) {
							if (checkTagNameEditable(openingNode, INLINE_EDIT_HTML_TAGS)) return;

							if (t.isJSXElement(elementNode) && hasMeaningfulTextContent(elementNode)) {
								attachAssistedEditId(openingNode, editId);
								attributesAdded++;
							}
							return;
						}

						// Condition 3: image src must be a non-empty static string
						const imageValidation = validateImageSrc(openingNode);
						if (!imageValidation.isValid) {
							attachAssistedEditId(openingNode, editId);
							attributesAdded++;
							return;
						}

						// Condition 4: mark as assisted-edit if spread props or dynamic children
						if (shouldDisableDueToChildren(elementNode, openingNode)) {
							attachAssistedEditId(openingNode, editId);
							attributesAdded++;
							return;
						}

						// Condition 5: skip or mark assisted-edit based on child composition
						const childResult = evalChildComposition(elementNode, openingNode);
						if (childResult === 'skip') return;
						if (childResult === 'disabled') {
							attachAssistedEditId(openingNode, editId);
							attributesAdded++;
							return;
						}

						// Condition 6: recursive subtree check — dynamic expressions,
						// spread props, or conditionals anywhere below this element make
						// a direct edit unsafe (it would overwrite the JSX with static text).
						if (subtreeRequiresAssistance(elementNode)) {
							attachAssistedEditId(openingNode, editId);
							attributesAdded++;
							return;
						}

						const urlAttributeName = detectUrlAttribute(openingNode);
						attachEditAttributes(openingNode, editId, urlAttributeName);
						attributesAdded++;
					}
				});

				if (attributesAdded > 0) {
					const output = generateSourceWithMap(babelAst, webRelativeFilePath, code);
					return { code: output.code, map: output.map };
				}

				return null;
			} catch (error) {
				console.error(`[vite][visual-editor] Error transforming ${id}:`, error);
				return null;
			}
		},

		// Computes the source a batch of draft edits would produce and returns it.
		// Nothing is written here — the preview posts the result up to the editor,
		// which persists it through the authenticated backend.
		configureServer(server) {
			server.middlewares.use('/api/draft-save', async (request, response, next) => {
				if (request.method !== 'POST') return next();

				// Defence in depth only: this endpoint is public and Sec-Fetch-Site is
				// client-supplied, so it stops browser-driven cross-origin calls and
				// nothing more. Authorisation happens on the backend persist route.
				if (!isSameOriginRequest(request)) {
					response.writeHead(403, { 'Content-Type': 'application/json' });
					return response.end(JSON.stringify({ error: 'Forbidden' }));
				}

				let body = '';
				request.on('data', chunk => { body += chunk.toString(); });

				request.on('end', async () => {
					let parsedBody;
					try {
						parsedBody = JSON.parse(body);
					} catch {
						response.writeHead(400, { 'Content-Type': 'application/json' });
						return response.end(JSON.stringify({ error: 'Invalid JSON request body' }));
					}

					if (!parsedBody || typeof parsedBody !== 'object') {
						response.writeHead(400, { 'Content-Type': 'application/json' });
						return response.end(JSON.stringify({ error: 'Invalid JSON request body' }));
					}

					try {
						const { draft } = parsedBody;

						if (!draft || typeof draft !== 'object') {
							response.writeHead(400, { 'Content-Type': 'application/json' });
							return response.end(JSON.stringify({ error: 'Missing or invalid draft object' }));
						}

						const { editsByFile, results } = groupEditsByFile(draft);

						for (const [absoluteFilePath, fileEdits] of editsByFile) {
							const originalContent = fs.readFileSync(absoluteFilePath, 'utf-8');
							const babelAst = parseFileToAST(absoluteFilePath);
							let fileModified = false;

							for (const { draftKey, edit, parsedId } of fileEdits) {
								const { modified, error } = applyElementEdit(babelAst, edit, parsedId);
								if (!modified) {
									results.push({ draftKey, success: false, error });
									continue;
								}
								fileModified = true;
							}

							if (fileModified) {
								results.push(renderEditedSource(babelAst, absoluteFilePath, originalContent));
							}
						}

						response.writeHead(200, { 'Content-Type': 'application/json' });
						response.end(JSON.stringify({ success: true, results }));
					} catch (error) {
						console.error('[vite][visual-editor] Error in draft-save:', error);
						response.writeHead(500, { 'Content-Type': 'application/json' });
						response.end(JSON.stringify({ error: 'Internal server error during draft save.' }));
					}
				});
			});
		}
	};
}
