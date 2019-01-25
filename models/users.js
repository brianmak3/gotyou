var mongoose = require('mongoose');
var userSchema = new mongoose.Schema({
  _id: String,
  img: String,
  name: String,
  phonCode: String,
  gender:String,
  role:String,
  sessions:[{
    _id:Number,
    by: {
      name:String,
      img:String,
      _id:Number
    },
    lastMessage:String,
    time: Number
  }],
  scheduled:{
    time:String,
    date:String,
    status:String,
    id:Number,
    therId:String
  }
});
module.exports = mongoose.model('users', userSchema);