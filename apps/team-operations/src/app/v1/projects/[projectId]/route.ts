import { route } from '../../../../server/http';
import { getProject } from '../../../../server/work';

export const GET = route(getProject);
