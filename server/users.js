#!/usr/bin/env node
/**
 * User administration CLI.
 *
 * Usage (from the server/ folder, or inside the Docker container):
 *
 *   node users.js list
 *   node users.js delete <username|email>
 *   node users.js reset-password <username|email> <newPassword>
 *   node users.js make-admin <username|email>
 *
 * This is handy when you need to remove a user or fix a forgotten password
 * without the web UI.
 */
import { db } from './db.js';
import { hashPassword } from './auth.js';

const [cmd, arg1, arg2] = process.argv.slice(2);

function findUser(key) {
  return db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(key, key);
}

switch (cmd) {
  case 'list': {
    const rows = db
      .prepare('SELECT id, username, email, display_name, is_admin, created_at FROM users ORDER BY created_at')
      .all();
    if (rows.length === 0) {
      console.log('No hay usuarios.');
      break;
    }
    console.table(
      rows.map((u) => ({
        id: u.id,
        usuario: u.username,
        email: u.email,
        nombre: u.display_name,
        admin: u.is_admin ? 'sí' : '',
      })),
    );
    break;
  }

  case 'delete': {
    if (!arg1) {
      console.error('Uso: node users.js delete <usuario|email>');
      process.exit(1);
    }
    const u = findUser(arg1);
    if (!u) {
      console.error(`No se encontró ningún usuario con "${arg1}".`);
      process.exit(1);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    console.log(`Usuario "${u.username}" (${u.email}) eliminado.`);
    break;
  }

  case 'reset-password': {
    if (!arg1 || !arg2) {
      console.error('Uso: node users.js reset-password <usuario|email> <nuevaContraseña>');
      process.exit(1);
    }
    const u = findUser(arg1);
    if (!u) {
      console.error(`No se encontró ningún usuario con "${arg1}".`);
      process.exit(1);
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(arg2), u.id);
    console.log(`Contraseña de "${u.username}" actualizada.`);
    break;
  }

  case 'make-admin': {
    if (!arg1) {
      console.error('Uso: node users.js make-admin <usuario|email>');
      process.exit(1);
    }
    const u = findUser(arg1);
    if (!u) {
      console.error(`No se encontró ningún usuario con "${arg1}".`);
      process.exit(1);
    }
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(u.id);
    console.log(`"${u.username}" ahora es administrador.`);
    break;
  }

  default:
    console.log(`Administración de usuarios de Owlbear Clone

Uso:
  node users.js list
  node users.js delete <usuario|email>
  node users.js reset-password <usuario|email> <nuevaContraseña>
  node users.js make-admin <usuario|email>
`);
}
