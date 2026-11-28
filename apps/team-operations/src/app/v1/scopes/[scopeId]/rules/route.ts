import { route } from '../../../../../server/http';
import { scopeActions } from '../../../../../server/work';

export const GET = route(scopeActions.listScopeRules);
