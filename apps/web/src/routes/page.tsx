import type { Route } from './+types/page';
import { useLocation } from 'react-router';
import { seo } from '@/lib/seo';
import { Workspace } from '@/components/workspace';
export function meta({matches,location}:Route.MetaArgs){const page=location.pathname.split('/')[1];return seo({matches,location},{title:page.replaceAll('-',' ')+' | Project Mania',description:'Explore thoughtful project creation at Project Mania. Share your requirements, discover real team-uploaded work, and manage your private project inquiries.',noindex:['login','register','account','admin','request','forgot-password'].includes(page)});}
export default function Page(){const location=useLocation();return <Workspace page={location.pathname.split('/')[1]}/>;}
