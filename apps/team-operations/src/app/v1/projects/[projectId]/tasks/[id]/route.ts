import { route } from '../../../../../../server/http';
import { deleteTask, getTask, updateTask } from '../../../../../../server/work';

export const GET = route(getTask);
export const PATCH = route(updateTask);
export const DELETE = route(deleteTask, { status: 204 });
