declare const orgIdBrand: unique symbol;
declare const userIdBrand: unique symbol;

/** Organization id. Branded so it cannot be swapped with another kind of id. */
export type OrgId = string & { readonly [orgIdBrand]: 'OrgId' };
/** User id. Branded so it cannot be swapped with another kind of id. */
export type UserId = string & { readonly [userIdBrand]: 'UserId' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuid(kind: string, value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new TypeError(`${kind} must be a UUID`);
  }
  return value.toLowerCase();
}

export function parseOrgId(value: unknown): OrgId {
  return parseUuid('org id', value) as OrgId;
}

export function parseUserId(value: unknown): UserId {
  return parseUuid('user id', value) as UserId;
}
