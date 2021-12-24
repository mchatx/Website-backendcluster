const express = require("express")
const bodyParser = require("body-parser")
const cors = require('cors')
const { MongoClient } = require("mongodb")
const Config = require('../Config/Config.json');

const ConnString = Config.MongoReader;
const client = new MongoClient(ConnString, { useUnifiedTopology: true, maxPoolSize: 150 });

const LocalStringManager = Config.MongoLocalProxy;
const LocalClient = new MongoClient(LocalStringManager, { useUnifiedTopology: true, maxPoolSize: 50000 });

const PORT = Config.ListenerPort
const app = express()
app.use(bodyParser.json( { limit: '20mb'} ))
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))
app.use(cors());

//-------------------------------------------------------- LISTENER HANDLER --------------------------------------------------------
app.get('/', async function (req, res) {
    if (req.query.room == undefined){
        res.status(400).send("ERROR : NO ROOM PROVIDED");
    } else {
        var QueryRes = await LocalClient.db('RoomList').collection('List').findOne({ Nick: { $eq: req.query.room } }, {projection:{ _id: 0, EntryPass: 1} });
    
        if (QueryRes == null){
            res.status(400).send("ERROR : ROOM NOT FOUND");
        } else {
            if (QueryRes.EntryPass){
                if (req.query.pass == undefined){
                    res.status(400).send("ERROR : ROOM IS PASSWORD PROTECTED, PLEASE SUBMIT PASSWORD TOO");
                } else {
                    QueryRes = await client.db('RoomList').collection('Pass').findOne({ $and: [{ Nick: { $eq: req.query.room } }, { EntryPass: { $eq: req.query.pass } }] }, {projection:{ _id: 0}});
                    if (QueryRes == null){
                        res.status(400).send("ERROR : PASSWORD DOES NOT MATCH");
                    } else {
                        AddListener(res, req, req.query.room);
                    }
                }
            } else {
                AddListener(res, req, req.query.room);
            }
        } 
    }
})

const pipeline = [
    {
        '$match': {  $or : [ { operationType: { $eq: 'insert' } }, { operationType: { $eq: 'delete' } }, { operationType: { $eq: 'update' } } ]},
    }
  ];

const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    "Access-Control-Allow-Origin": "*",
    'X-Accel-Buffering': 'no'
  };

var ListenerPack = [];

function SeekRoom(room){
    if (ListenerPack.length == 0){
        return (-1);
    }

    for (var i = 0; i < ListenerPack.length; i++){
        if (ListenerPack[i].Room == room){
            return (i);
        } else if ( i == ListenerPack.length - 1){
            return (-1);
        }
    }
}

function AddListener(res, req, room){
    const newID = Date.now();
    const NewConn = {
        id: newID,
        res
    };

    res.writeHead(200, headers);
    res.flushHeaders();
    res.write("data: { \"flag\":\"connect\", \"content\":\"CONNECTED TO SERVER\"}\n\n");

    var indextarget = SeekRoom(room);
    if (indextarget != -1){
        ListenerPack[indextarget].ConnList.push(NewConn);
    } else {
        var MongoSub = client.db("ActiveSession").collection(room).watch(pipeline);
        
        MongoSub.on('change', (next) => {
            const idx = SeekRoom(next.ns.coll);
            if (idx != -1){
                ListenerPack[idx].Active = true;
                
                if (next.operationType == "insert"){
                    broadcast(idx, "{ \"flag\":\"insert\", \"content\": " + JSON.stringify(next.fullDocument) + " }");  
                } else if (next.operationType == "update") {
                    client.db("ActiveSession").collection(next.ns.coll).findOne({ _id: { $eq: next.documentKey._id } }).then( 
                        function(result) {
                            broadcast(idx, "{ \"flag\":\"update\", \"content\": " + JSON.stringify(result) + " }");
                    }); 
                } else if (next.operationType == "delete") {
                    broadcast(idx, "{ \"flag\":\"delete\", \"content\":\"" + next.documentKey._id.toString() + "\" }");
                }
            }
        });
    
        ListenerPack.push({
            Active: true,
            BoolPool: 0,
            Room: room,
            ConnList: [NewConn],
            Watcher: MongoSub
        })
    }

    req.on('close', () => {
        const idx = SeekRoom(room);
        if (idx != -1){
            ListenerPack[idx].ConnList = ListenerPack[idx].ConnList.filter(c => c.id !== newID);
            if (ListenerPack[idx].ConnList.length == 0){
                ListenerPack[idx].Watcher.close();
                ListenerPack.splice(idx, 1);
            }
        }
    });
}

function broadcast(idx, data){
    ListenerPack[idx].ConnList.forEach(c => c.res.write("data:" + data + "\n\n"));
}

function Pinger() {
    for(i = 0; i < ListenerPack.length;){
        if (ListenerPack[i].Active){
            if (ListenerPack[i].ConnList.length == 0){
                ListenerPack[i].Watcher.close();
                ListenerPack.splice(i, 1);
            } else {
                ListenerPack[i].Active = false;
                ListenerPack[i].BoolPool = 0;
                i++;
            }
        } else {
            ListenerPack[i].BoolPool += 1;
            if (ListenerPack[i].BoolPool == 30){
                ListenerPack[i].Watcher.close();
                for(;ListenerPack[i].ConnList.length != 0;){
                    ListenerPack[i].ConnList[0].res.write("data: { \"flag\":\"timeout\", \"content\":\"Translator side time out\" }\n\n");
                    ListenerPack[i].ConnList[0].res.end();
                    ListenerPack[i].ConnList.splice(0, 1);
                    if (ListenerPack[i].ConnList.length == 0){
                        ListenerPack.splice(i, 1);
                        break;
                    }
                }
            } else {
                broadcast(i, "{}");
                i++;
            }
        }
    }
}
//======================================================== LISTENER HANDLER ========================================================



async function InitServer() {
    await client.connect();
    await LocalClient.connect();
    setInterval(Pinger, 1000*10);

    app.listen(PORT, async function () {
        console.log(`Server initialized on port ${PORT}`);
    })
}

InitServer();