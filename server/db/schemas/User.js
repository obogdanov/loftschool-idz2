/**
 * Module dependencies.
 */
var mongoose = require('mongoose');
var logger = require('../../utils/winston')(module);
var async = require('async');
var crypto = require('crypto');
var util = require('util');
var Schema = mongoose.Schema;
var schemaUserData = require('./UserData').sUserData;

/**
 * Схема Коллекции Пользователей
 */
var schemaUser = new Schema({
  username:               {
    type:      String,
    maxlength: 254,
    lowercase: true,
    trim:      true,
    unique:    true,
    required:  true
  },
  hashedPassword:         {
    type:     String,
    required: true
  },
  salt:                   {
    type:     String,
    required: true
  },
  resetPasswordToken:     {
    type:      String,
    maxlength: 1024,
    default:   ''
  },
  resetPasswordExpires:   {
    type:    Date,
    default: Date.now() + 3600000 // 1 hour
  },
  emailConfirmationToken: {
    type:    String,
    default: new mongoose.Types.ObjectId().toString()
  },
  userdata:               {
    type:    schemaUserData,
    default: schemaUserData
  }, // Данные пользователя будем хранить в этой же коллекции. Схема данных описана в UserData
  created:                {
    type:    Date,
    default: Date.now
  }
});

// ================= User Entity Methods =============================
schemaUser.methods.encryptPassword = function (password) {
  return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
  //more secure -return crypto.pbkdf2Sync(password, this.salt, 10000, 512);
};

schemaUser.methods.checkPassword = function (password) {
  return this.encryptPassword(password) === this.hashedPassword;
};

// ================= Schema Statics Methods =============================
schemaUser.statics.authorize = function (username, password, next) {
  var User = this;
  async.waterfall([
        function (cb) {
          User.findOne({'username': username.toLowerCase()}, cb);//-> Ищем пользователя в БД по username(он же email)
        },
        function (user, cb) {// ошибок не возникло возвращен результат из пред функции
          if (!user) {//-> пользователь не найден в БД
            logger.debug('Такого пользователя не существует %s', username);
            return cb(new AuthError('Такого пользователя не существует'), false);
          }

          if (!user.checkPassword(password)) { //-> Проверяем пароль
            logger.debug('Введен неверный пароль для пользователя %s', username);
            return cb(new AuthError('Вы ввели неверный пароль'), false);
          }
          // Пользователь существует и пароль верен, возврат пользователя из
          // метода done, что будет означать успешную аутентификацию
          cb(null, user);
        }
      ],
      next //-> Все ОК отдаем Passport(у) результат
  );
};

schemaUser.statics.register = function (username, password, next) {
  var User = this;
  async.waterfall([
        function (cb) {
          User.findOne({'username': username.toLowerCase()}, cb);//-> Ищем пользователя в БД по username(он же email)
        },
        function (user, cb) {// ошибок не возникло возвращен результат из пред функции
          if (user) {//-> если пользователь найден
            return cb(new AuthError('Имя пользователя уже занято'), false); //-> возвращаем собственную ошибку
          }
          else {//-> пользователь по email не найден в БД
            var newUser = new User({
              'username': username,
              'password': password
            });

            // Дополняем данными объект пользователя
            newUser.userdata.emailAddress = username;

            // Сохраняем нового пользователя в БД.
            // И передаем управление следующему обработчику
            newUser.save(function (err) {
              //http://mongoosejs.com/docs/validation.html
              // err is our ValidationError object
              // err.errors.emailAddress is a ValidatorError object
              // err.errors.password is a ValidatorError object
              if (err) return cb(err, false);
              cb(null, newUser);
            });
          }
        }
      ],
      next
  );
};

// ================= User Virtuals =============================
schemaUser.virtual('userId')
.get(function () {
  return this.id;
});

schemaUser.virtual('password')
.set(function (password) {
  this._plainPassword = password;
  this.salt = crypto.randomBytes(32).toString('base64');
  //more secure - this.salt = crypto.randomBytes(128).toString('base64');
  this.hashedPassword = this.encryptPassword(password);
})
.get(function () {
  return this._plainPassword;
});

// ================= Validation =============================
schemaUser.path('hashedPassword').validate(function (value) {
  if (this._plainPassword) {
    if (this._plainPassword.length < 8) {
      this.invalidate('password', 'Пароль должен содержать не менее 8 символов ');
    }
  }
  if (this.isNew && !this._plainPassword) {
    this.invalidate('password', 'Пароль не может быть пустым');
  }
}, null);

// ================= Private Func =============================
function AuthError(message) {
  Error.apply(this, arguments);
  Error.captureStackTrace(this, AuthError);

  this.message = message;
}

util.inherits(AuthError, Error);

AuthError.prototype.name = 'AuthError';

// ================= Exports =============================
//var modelUser = mongoose.model('User', schemaUser);

module.exports.sUser = schemaUser;
module.exports.AuthError = AuthError;





