const express = require('express');
const bodyParser = require('body-parser');
const mongodb = require('mongodb');
const socket = require('socket.io');
const port = 3000;
let users;
let count;
let chatRooms;
let messagesArray = [];

const app = express();

// body-parser middleware
app.use(bodyParser.json());

const MongoClient = mongodb.MongoClient;

// Allowing cross-origin sites to make requests to this API
app.use((req, res, next) => {
    res.append('Access-Control-Allow-Origin' , 'http://localhost:4200');
    res.append('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.append("Access-Control-Allow-Headers", "Origin, Accept,Access-Control-Allow-Headers, Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers");
    res.append('Access-Control-Allow-Credentials', true);
    next();
});

// Connecting to MongoDB
MongoClient.connect('mongodb://localhost:27017/Chat_App', (err, Database) => {
    if(err) {
        console.log(err);
        return false;
    }
    console.log("Connected to MongoDB");
    const db = Database.db("Chat_App"); 
    users = db.collection("users"); // getting the users collection
    chatRooms = db.collection("chatRooms"); /* getting the chatRooms collection. 
                                                This collection would store chats in that room*/
    
    // starting the server on the port number 3000 and storing the returned server variable 
    const server = app.listen(port, () => {
        console.log("Server started on port " + port + "...");
    });
    const io = socket.listen(server);

    /* 'connection' is a socket.io event that is triggered when a new connection is 
       made. Once a connection is made, callback is called. */
    io.sockets.on('connection', (socket) => { /* socket object allows us to join specific clients 
                                                to chat rooms and also to catch
                                                and emit the events.*/
        // 'join event'
        socket.on('join', (data) => {          
            socket.join(data.room);
            chatRooms.find({}).toArray((err, rooms) => {
                if(err){
                    console.log(err);
                    return false;
                }
                count = 0;
                rooms.forEach((room) => {
                    if(room.name == data.room){
                        count++;
                    }
                });
                // Create the chatRoom if not already created
                if(count == 0) {
                    chatRooms.insert({ name: data.room, messages: [] }); 
                }
            });
        });
        // catching the message event
        socket.on('message', (data) => {
            // emitting the 'new message' event to the clients in that room
            io.in(data.room).emit('new message', {user: data.user, message: data.message});
            // save the message in the 'messages' array of that chat-room
            chatRooms.update({name: data.room}, { $push: { messages: { user: data.user, message: data.message } } }, (err, res) => {
                if(err) {
                    console.log(err);
                    return false;
                }
            });
        });
        // Event when a client is typing
        socket.on('typing', (data) => {
            // Broadcasting to all the users except the one typing 
            socket.broadcast.in(data.room).emit('typing', {data: data, isTyping: true});
        });
    });

}); 

app.get('/', (req, res, next) => {
    res.send('Welcome to the express server...');
});

// POST request route to save users to the database
app.post('/api/users', (req, res, next) => {
    let user = {
        username: req.body.username,
        email: req.body.email,
        password: req.body.password
    };
    let count = 0;    
    users.find({}).toArray((err, Users) => {
        if (err) {
            console.log(err);
            return res.status(500).send(err);
        }
        for(let i = 0; i < Users.length; i++){
            if(Users[i].username == user.username)
            count++;
        }
        // Add user if not already signed up
        if(count == 0){
            users.insert(user, (err, User) => {
                if(err){
                    res.send(err);
                }
                res.json(User);
            });
        }
        else {
            res.json({ user_already_signed_up: true });
        }
    });
    
});

// POST request route that handles login logic
app.post('/api/login', (req, res) => {
    let isPresent = false;
    let correctPassword = false;
    let loggedInUser;

    users.find({}).toArray((err, users) => {
        if(err) return res.send(err);
        users.forEach((user) => {
            if((user.username == req.body.username)) {
                if(user.password == req.body.password) {
                    isPresent = true;
                    correctPassword = true;
                    loggedInUser = {
                        username: user.username,
                        email: user.email
                    }    
                } else {
                    isPresent = true;
                }
            }
        });
        // Send response accordingly
            res.json({ isPresent: isPresent, correctPassword: correctPassword, user: loggedInUser });
    });
});

// Route for getting all the users
app.get('/api/users', (req, res, next) => {
    users.find({}, {username: 1, email: 1, _id: 0}).toArray((err, users) => {
        if(err) {
            res.send(err);
        }
        res.json(users);
    });
});

/* Route for getting all the messages for a specific chat-room 
 specified by the query parameter room */
app.get('/chatroom/:room', (req, res, next) => {
    let room = req.params.room;
    chatRooms.find({name: room}).toArray((err, chatroom) => {
        if(err) {
            console.log(err);
            return false;
        }
        res.json(chatroom[0].messages);
    });
});
