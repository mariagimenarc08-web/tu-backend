const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verificarToken = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token requerido.' });
  }

  try {
    const decodificado = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await User.findById(decodificado.id).select('bloqueado');
    if (usuario && usuario.bloqueado) {
      return res.status(403).json({ error: 'Tu cuenta ha sido bloqueada. Contacta al administrador.' });
    }
    req.usuario = decodificado;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido.' });
  }
};

const verificarRol = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    }
    next();
  };
};

module.exports = { verificarToken, verificarRol };
