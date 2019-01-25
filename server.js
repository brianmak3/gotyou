
const
  express = require('express'),
  app = express(),
  http = require('http').Server(app),
  io = require('socket.io')(http),
  mongo = require('mongodb').MongoClient,
  cors = require('cors'),
   fs = require('fs'),
  ObjectId = require('mongodb').ObjectId,
  multer = require('multer'),
  path = require('path'),
  mongoose = require('mongoose'),
 storage =   multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, './public/uploads');
    },
    filename: function (req, file, callback) {
        var extArray = file.mimetype.split("/");
        var extension = extArray[1];
        callback(null, file.fieldname + '_'+Date.now()+'.'+extension);
    }

}),
  upload = multer({ storage : storage, limits: { fieldSize: 10 * 1024 * 1024 }}).single('neaybye'),
  Users = require('./models/users');
  Messages = require('./models/messages');
// mongoose.connect('mongodb://nearby:nearby@127.0.0.1/nearBy');
 mongoose.connect('mongodb://gotYou:gotYou@127.0.0.1/gotYou',{ useNewUrlParser: true });

// basic setup
app.use(cors());
app.use(express.static('www'));
app.use(require('stylus').middleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));
// home
app.get('/', (req, res) => {
  res.send('Unknown origin.');
});
app.post('/imgupload',(req, res)=>{
   upload(req, res, function (err) {
            if (err)
                console.log(err);
            if(req.file){
              var url = req.body.url+'//uploads/';
                var pic = url + req.file.filename;
                var userId = req.body.id;
             if(req.body.messageId == "null"){
                res.status(201).json(pic);
                Users.findOne({'_id': userId}, {img:1, _id:0}, function (err, user) {
                    if (err)
                        throw err;
                    else{
                     var rem = 'public/'+user.img.split('//')[2];
                        if (user.pic !== 'avatar.jpg') {
                               fs.unlink(rem, function (e) {
                            });
                        }
                    }
                });
                Users.updateOne({'_id': userId}, {$set: {'img': pic}}, function (err) {
                    if (err)
                        throw err;
                });
                //update user
              }
              else{
                var message = JSON.parse(req.body.messageId);
                message.image.url = pic;
                message.image.sent = true;
                res.status(201).json(JSON.stringify(message));
              }
          }

        })
})


// setup socket.io
io.on('connection', function(socket){
  var remove = Date.now()-(3600*24);
  Users.updateMany({'scheduled.id': {$lte:remove}}, {$set: {scheduled:{}}},{multi: true}, function(err,res){
    if(err)
       throw err;
  })
  socket.on('appData', function(data){
      switch(data.action){
         case 'getUserData':
            Users.findOne({_id:data.userId},function(err,user){
              if(err)
                 throw err;
               if(user){
                 if(user.scheduled && user.scheduled.status == 'live'){
                   getUser(user.scheduled.therId, (friend)=>{
                    getMessages(user.scheduled.id, (messages)=>{
                        socketEmit(socket, {
                          action: 'userFound',
                          user:user,
                          friend:friend,
                          messages:messages.messages
                         },null);
                       })
                  })
                 }else if(user.role == 'therapist'){
                     Users.findOne({'scheduled.therId': user._id,'scheduled.status':'live'},{img:1,name:1,scheduled:1},function(err,friend){
                      if(err)
                         throw err;
                       else
                         getMessages((friend && friend.scheduled?friend.scheduled.id:0), (messages)=>{
                           socketEmit(socket, {
                            action: 'userFound',
                            user:user,
                            friend:friend,
                            messages:(messages ? messages.messages:[])
                          },null);
                        })
                     })
                 }else{
                   socketEmit(socket, {
                    action: 'userFound',
                    user:user
                   },null);
                 }
               }else{
                var newUser = new Users();
                newUser.img = data.img;
                newUser._id = data.userId;
                newUser.phonCode = data.userId;
                newUser.save(function(err){
                  if(err)
                     throw err;
                   else
                    socketEmit(socket, {
                      action: 'userFound',
                      user:newUser
                     },null);
                    })
               }
            })
            if(data.admin == true){
              getSession(socket);
              Users.find({role:'therapist'},function(err,res){
                if(err)
                   throw err;
                 else
                   socketEmit(socket, {
                      action: 'foundTherapists',
                      users:res
                     },null);
              })
            }
         break;
         case 'updateUser':
         Users.updateOne({_id: data.user.phonCode},{$set:data.user},function(err, res){

           if(err)
              throw err
            else{
              socketEmit(socket, {
                      action: 'userFound',
                      user:data.user,
                      update:true
               },null);
            }
         })
         break;
         case 'schedule':
         Users.findOne({'_id':data._id},{scheduled:1}, function(err, res){
            if(err)
               throw err;
             else{
              var message,
              scheule;
              if(res.scheduled.date){
                scheule = res.scheduled
                message = (res.scheduled.status == 'live'? 'You already have an active session. Please end it to schedule a new one.': 'You already have another session scheduled. You can only schedule one session at a time.');
                socketEmit(socket, {
                                  action: 'scheduled',
                                  schedule:scheule,
                                  msg:message
                    },null);
              }
              else{
                Users.find({'scheduled.time':data.time,'scheduled.date':data.date},{scheduled:1},function(err, schedule){
                  if(err)
                    throw err
                  if(schedule.length > 0){
                    scheule = res.scheduled
                    message = 'Sorry, this date and time is already booked. Select another time or day.';
                  }else{
                        message = 'success';
                         scheule = {
                          time:data.time,
                          date:data.date,
                          status:data.status,
                          id: Date.parse(data.date +' '+data.time)
                         }
                         Users.updateOne({'_id':data._id}, {$set: {scheduled:scheule}}, function(err,res){
                          if(err)
                             throw err;
                         });

                         //submit session to admin
                         socketEmit(socket, {
                              action: 'scheduledUser',
                              schedule:{
                                scheduled:{
                                time:data.time,
                                date:data.date,
                                status:data.status,
                                id:Date.parse(data.date +' '+data.time)
                               },
                                name:data.name,
                                img:data.img,
                                _id:data._id
                              }

                       },true);
                         
                  }
                   socketEmit(socket, {
                                  action: 'scheduled',
                                  schedule:scheule,
                                  msg:message
                    },null);
                })
             
              }
             
             }
         })
         break;
         case 'deleteSession':
         Users.updateOne({'_id':data._id}, {$set: {scheduled:{}}}, function(err,res){
            if(err)
               throw err;
              socketEmit(socket, {
                    action: 'removeSchedule',
                    id:data._id
                    },true);
           });
         break;
         case 'endSession':
            Users.updateOne({'scheduled.id':data.scheduleId},{$set:{scheduled:{}}},function(err,res){
              if(err)
                 throw err;
               else {
                socketEmit(socket, data,true);
               }
            })
         break;
         case 'getSessions':
            getSession(socket);
         break;
         case 'actionUser':
          Users.updateOne({_id:data.userId}, {$set:{role:data.role}}, function(err){
            if(err)
               throw err;
               Users.findOne({_id:data.userId},{name:1,img:1, role:1}, function(err, user){
                if(err)
                   throw err;
                 else if(user)
                  socketEmit(socket, {
                    action: 'actionTherapist',
                    user:user
                    },true);
               })
          });
          break;
          case 'startSession':
            Users.updateOne({_id:data.client}, {$set:{'scheduled.therId':data.friend._id, 'scheduled.status':'live'}},function(err,res){
              if(err)
                 throw err;
               else
                 socketEmit(socket, data,true);
            })
           break;
           case 'delete':
           console.log(data);
              Messages.deleteOne({_id:data.id},function(err){if(err)throw err});
            break;
           case 'getMessages':
             var query;
             if(data.ther == null){
              query = {to:data.userId};
             }else{
               query  = {by:data.userId};
             }
              Messages.find(query,function(err,res){
                if(err)
                  throw err;
                 if(res.length > 0){
                  let chats = []
                  res.forEach((a,index)=>{
                    getUser((data.ther == null ? a.by:a.to), (user)=>{
                      chats.push({
                        friend:user,
                        chats:a.messages,
                        date:a.date,
                        id:a._id
                      });
                      if(index == res.length-1)
                        socketEmit(socket, {
                          action: 'foundChats',
                          chats:chats
                        },null);
                      })
                  })
                }
              })
           break;
           case 'newMessage':
             socketEmit(socket, data,true);
             Messages.findOne({_id:data.sessionId},{_id:1},function(err,res){
                if(err)
                  throw err;
                else if(!res)
                {
                   var newMessage = new  Messages();
                   newMessage._id = data.sessionId;
                   newMessage.by = data.from;
                   newMessage.to = data.to;
                   newMessage.date = data.date; 
                   newMessage.messages = [data];
                   newMessage.save(function(err){
                    if(err)
                       throw err;
                   })
                }else{
                   Messages.updateOne({_id:data.sessionId},{$push:{messages:data}},function(err,res){
                    if(err)
                       throw err;
                    
                   })
                }
             })
           break;
      }
  });
});
 function getUser(id, callback){
    Users.findOne({_id:id}, {name:1,img:1, _id:1},function(err,user){
      if(err)
        throw err
      else 
        callback(user);
    })
 }
 function getMessages(id, callback){
    Messages.findOne({_id:id}, function(err,messages){
                      if(err)
                         throw err;
                       else 
        callback(messages);
    })
 }
function getSession(socket){
    Users.find({'scheduled.status':{$exists: true},role:{$ne:'therapist'}},function(err,res){
        if(err)
          throw err
        if(res.length > 0)
          socketEmit(socket, {
              action: 'schedulesFound',
              sessions:res
          },null);
      }).sort({'scheduled.id':1});

}

const port = process.env.PORT || 3001;
http.listen(port, () => {
  console.log('listening on port', port);
});

function socketEmit(socket, data, thirdParty){
   if(thirdParty){
    socket.emit('serverData', data);
    socket.broadcast.emit('serverData', data);
   }else{
    socket.emit('serverData', data);
   }
}
