import { route } from '../../../../../server/http';
import { createTask, listTasks } from '../../../../../server/work';

export const GET = route(listTasks);
export const POST = route(createTask, { status: 201 });
