export type Role = 'gm' | 'player' | 'observer';

/**
 * Central permission map for the table (VTT).
 *
 *  - `gm`       → Game Master / Director de juego: control total de la mesa.
 *  - `player`   → Jugador: usa su token, chat, dibuja y mide.
 *  - `observer` → Solo mira: chat y medir, sin editar nada.
 *
 * NOTA: hoy el rol se declara en el cliente (mesa casual / sin cuenta).
 * Cuando la mesa está ligada a una campaña, el rol debería tomarse del
 * servidor (campaign_members.role). Ver `roleFromCampaign`.
 */
export type Permission =
  | 'scene.manage'
  | 'token.add'
  | 'token.moveAny'
  | 'token.deleteAny'
  | 'token.hide'
  | 'token.assignOwner'
  | 'draw'
  | 'fog.edit'
  | 'fog.clear'
  | 'drawing.clear'
  | 'measure'
  | 'chat'
  | 'seeHiddenTokens'
  | 'user.manage';

const GRANTS: Record<Role, Permission[]> = {
  gm: [
    'scene.manage',
    'token.add',
    'token.moveAny',
    'token.deleteAny',
    'token.hide',
    'token.assignOwner',
    'draw',
    'fog.edit',
    'fog.clear',
    'drawing.clear',
    'measure',
    'chat',
    'seeHiddenTokens',
    'user.manage',
  ],
  player: ['token.add', 'token.assignOwner', 'draw', 'measure', 'chat'],
  observer: ['measure', 'chat'],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role]?.includes(permission) ?? false;
}

/** Map a campaign membership role ('owner' | 'gm' | 'player' | 'observer') to a table role. */
export function roleFromCampaign(role: string | null | undefined): Role {
  switch (role) {
    case 'owner':
    case 'gm':
      return 'gm';
    case 'observer':
      return 'observer';
    default:
      return 'player';
  }
}

export function isGM(role: Role): boolean {
  return role === 'gm';
}
