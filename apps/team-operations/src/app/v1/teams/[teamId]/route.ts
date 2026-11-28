import { route } from '../../../../server/http';
import { getTeam } from '../../../../server/work';

export const GET = route(getTeam);
