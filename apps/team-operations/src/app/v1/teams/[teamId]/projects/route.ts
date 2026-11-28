import { route } from '../../../../../server/http';
import { createProject } from '../../../../../server/work';

export const POST = route(createProject, { status: 201 });
