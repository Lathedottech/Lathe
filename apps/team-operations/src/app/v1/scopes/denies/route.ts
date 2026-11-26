import { route } from '../../../../server/http';
import { scopeActions } from '../../../../server/work';

export const POST = route(scopeActions.denyScopePermission, { status: 201 });
