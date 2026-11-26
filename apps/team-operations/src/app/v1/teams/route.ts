import { route } from '../../../server/http';
import { createTeam, listTeams } from '../../../server/work';

export const GET = route(listTeams);
export const POST = route(createTeam, { status: 201 });
