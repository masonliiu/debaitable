import { BadRequestError, RoleDefinition } from "../core"

export const assertValidRoles = (roles: RoleDefinition[]): void => {
  if (roles.length === 0) {
    throw new BadRequestError("At least one role is required")
  }
  const seen = new Set<string>()
  for (const role of roles) {
    if (seen.has(role.key)) {
      throw new BadRequestError(`Duplicate role key: ${role.key}`)
    }
    seen.add(role.key)
  }
}
