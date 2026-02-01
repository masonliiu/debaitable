import { roleDefinitions } from "./roles"
import { RoleDefinition, RoleKey } from "./types"

export const getRoleDefinition = (roleKey: RoleKey): RoleDefinition | null =>
  roleDefinitions.find((role) => role.key === roleKey) ?? null

export const requireRoleDefinition = (roleKey: RoleKey): RoleDefinition => {
  const role = getRoleDefinition(roleKey)
  if (!role) {
    throw new Error(`Role not found: ${roleKey}`)
  }
  return role
}

export const listRoleKeys = (): RoleKey[] =>
  roleDefinitions.map((role) => role.key)
