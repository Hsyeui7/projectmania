onRecordValidate((e) => {
 if (e.record.getString('status') === 'published' && !e.record.getString('primary')) throw new BadRequestError('A real primary photograph is required before publication.');
 e.next();
}, 'projects');
