var mongoose = require('mongoose');
var messageSchema = new mongoose.Schema({
   _id:Number,
   by: String, 
   to: String,
   date:String, 
   messages: [{
     to:String,
     from:String, 
     time: Number,
     message:String
   }]
});
module.exports = mongoose.model('draft', messageSchema);