const { verify } = require('../utils/authToken');

function requireAuth(...allowedTypes) {
  return (req, res, next) => {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const auth = verify(token);
    if (!auth) return res.status(401).json({ ok: false, message: 'Sesión inválida o vencida' });
    if (allowedTypes.length && !allowedTypes.includes(auth.tipo)) {
      return res.status(403).json({ ok: false, message: 'No tienes permiso para esta operación' });
    }
    if (req.tenant && auth.tipo !== 'superadmin' && Number(auth.id_restaurante) !== Number(req.tenant.id_restaurante)) {
      return res.status(403).json({ ok: false, message: 'La sesión pertenece a otro restaurante' });
    }
    req.auth = auth;
    next();
  };
}

module.exports = { requireAuth };
