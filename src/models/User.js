const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    maxlength: [100, 'El nombre no puede tener mas de 100 caracteres']
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [255, 'El email no puede tener mas de 255 caracteres'],
    match: [/^\S+@\S+\.\S+$/, 'Email invalido']
  },
  password: {
    type: String,
    required: [true, 'La contrasena es obligatoria'],
    minlength: [8, 'La contrasena debe tener al menos 8 caracteres'],
    maxlength: [128, 'La contrasena no puede tener mas de 128 caracteres']
  },
  rol: {
    type: String,
    enum: ['cliente', 'docente', 'admin'],
    required: true
  },
  telefono: {
    type: String,
    trim: true,
    maxlength: [20, 'El telefono no puede tener mas de 20 caracteres']
  },
  bloqueado: {
    type: Boolean,
    default: false
  },
  intentosLogin: {
    type: Number,
    default: 0
  },
  ultimoIntentoLogin: Date,
  fotoPerfil: String,
  resetToken: String,
  resetTokenExpira: Date,
  metodosPago: [{
    tipo: { type: String, enum: ['yape', 'plin', 'transferencia'] },
    info: { type: String, default: '' },
    qrUrl: String
  }],
  fechaCreacion: {
    type: Date,
    default: Date.now
  }
});

// Validacion de password fuerte
userSchema.path('password').validate(function(v) {
  if (this.isModified('password')) {
    if (!/[a-z]/.test(v)) return false;
    if (!/[A-Z]/.test(v)) return false;
    if (!/[0-9]/.test(v)) return false;
  }
  return true;
}, 'La contrasena debe incluir al menos una minuscula, una mayuscula y un numero');

// Hashear contrasena antes de guardar
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Metodo para comparar contrasenas
userSchema.methods.compararPassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Sanitizar al convertir a JSON
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  delete obj.intentosLogin;
  delete obj.ultimoIntentoLogin;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
