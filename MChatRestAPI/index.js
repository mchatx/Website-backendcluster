const express = require("express")
const bodyParser = require("body-parser")
const cors = require('cors')
const request = require('request');
const { MongoClient, ObjectId } = require("mongodb")
const crypto = require('crypto')
const Config = require('../Config/Config.json');

const ConnString = Config.MongoReader;
const client = new MongoClient(ConnString, { useUnifiedTopology: true, maxPoolSize: 350 });

const ConnStringManager = Config.MongoWriter;
const clientmanager = new MongoClient(ConnStringManager, { useUnifiedTopology: true, maxPoolSize: 20 });

const LocalStringManager = Config.MongoLocalProxy;
const LocalClient = new MongoClient(LocalStringManager, { useUnifiedTopology: true, maxPoolSize: 50000 });

var Firebase = require("firebase-admin");
var serviceAccount = require(Config.FirebaseCred);

const MailerBot = require("nodemailer");
const { urlencoded } = require("body-parser");

const transporter = MailerBot.createTransport({
    port: 25,
    host: 'localhost',
    tls: {
      rejectUnauthorized: false
    },
});

Firebase.initializeApp({
  credential: Firebase.credential.cert(serviceAccount),
  databaseURL: Config.FirebaseDBURL
});

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

const PORT = Config.MainPort
const app = express()
app.use(bodyParser.json( { limit: '20mb'} ))
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))
app.use(cors());

app.post('/Stats/', async function (req, res) {
    if (req.body.pass == undefined){
        res.status(400).send(" :P ");
    } else {
        if (req.body.pass != "YagooBestGirl"){
            res.status(400).send(" :P ");
        } else {
            var msgcontainer = [];

            if (ConnList.length == 0) {
                res.status(200).send("NONE");
            } else {
                for (i = 0; i < ConnList.length; i++){
                    msgcontainer.push( {
                        Room : ActiveRoom[i],
                        Client: ConnList[i].length
                    });
    
                    if (i == ConnList.length - 1){
                        res.status(200).send(msgcontainer);
                    }
                }
            }
        }
    }
})

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
  
//-------------------------------------------------------- ROOM HANDLER --------------------------------------------------------
app.get("/Room/", async (req, res) => {
    try {
        var RoomList;
        var Query = {};

        if (!req.query.page){
            req.query.page = 0;
        } else {
            req.query.page -= 1;
        }

        if (req.query.page < 0){
            return res.status(400).send("ERROR : BAD REQUEST");
        }

        if (req.query.room){
            Query["Nick"] = { $eq: req.query.room.toString() };
        }

        if (req.query.tags){
            Query["Tags"] = new RegExp(escapeRegExp(req.query.tags).replace(/_/gi, "|"), 'i');
        }

        if (req.query.link){
            Query = {
                $or : [ 
                    {"StreamLink": { $in: LinkArrayBuilder(parselink(req.query.link.toString())) }},
                    {"AuxLink": { $in: LinkArrayBuilder(parselink(req.query.link.toString())) }}
                ],
                ...Query
            }
            //Query["StreamLink"] = { $in: LinkArrayBuilder(parselink(req.query.link.toString())) };
        }

        RoomList = await LocalClient.db('RoomList').collection('List').find(Query, {projection:{ _id: 0}}).skip(req.query.page * 20).limit(20).toArray();
        return res.json(RoomList);

    } catch (error){
        console.error(error);
    } finally {
    } 
})

app.post('/Room/', async function (req, res) {
    if ((req.body.Nick == undefined) || (req.body.Pass == undefined) || (req.body.Note == undefined) || (req.body.Contact == undefined)){
        res.status(400).send("ERROR : INCOMPLETE PARAMETERS");
    } else {
        clientmanager.db('RoomList').collection("RoomApplication").insertOne({ Nick: req.body.Nick, Pass: crypto.createHash('sha256').update(req.body.Pass).digest('hex'), Note: req.body.Note, Contact: req.body.Contact, PP: req.body.Pass});
        res.status(200).send("OK");
    }
})
//======================================================== ROOM HANDLER ========================================================



//-------------------------------------------------------- ARCHIVE HANDLER --------------------------------------------------------
app.get("/Archive/", async (req, res) => {
    try {
        var RoomList;
        var Query = {};

        if (!req.query.page){
            req.query.page = 0;
        } else {
            req.query.page -= 1;
        }

        if (req.query.page < 0){
            return res.status(400).send("ERROR : BAD REQUEST");
        }

        if (req.query.TimeStamp != undefined){
            if (req.query.Token  == undefined){
                res.status(400).send("ERROR : INVALID TOKEN");
            } else if ( Number(req.query.TimeStamp) == NaN ) {
                res.status(400).send("ERROR : INVALID TOKEN");
            } else  if ( Number(req.query.TimeStamp) < Date.now() - 10000) {
                res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (req.query.Token != crypto.createHash('sha256').update(req.query.TimeStamp.toString() + "Y4g00B3stG1rl").digest('hex')) {
                    res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    Query = {};
                    Query["Hidden"] = { $eq: false};

                    if (req.query.room){
                        Query["Room"] = { $eq: req.query.room.toString() };
                    }
                    if (req.query.tags){
                        Query["Tags"] = new RegExp(escapeRegExp(req.query.tags).replace(/_/gi, "|"), 'i');
                    }
                    if (req.query.arlink){
                        Query["Link"] = { $eq: req.query.arlink};
                    }
                    if (req.query.nick){
                        Query["Nick"] = { $regex: new RegExp(req.query.nick, "i")};
                    }

                    if (req.query.link){
                        Query = {
                            $or : [ 
                                {"StreamLink": { $in: LinkArrayBuilder(parselink(req.query.link.toString())) }},
                                {"AuxLink": { $in: LinkArrayBuilder(parselink(req.query.link.toString())) }}
                            ],
                            ...Query
                        }
                    }

            
                    RoomList = await LocalClient.db('Archive').collection('List').find(Query, {projection:{ _id: 0, Nick: 1, Link: 1, Pass: 1, Room: 1, AuxLink: 1, StreamLink: 1, Tags: 1, Star: 1, ExtShare: 1, Downloadable: 1}}).sort({$natural: -1}).skip(req.query.page*20).limit(20).toArray();
                    return res.json(RoomList);
                }
            }
        } else {
            Query = {};
            Query["Hidden"] = { $eq: false};
            Query["ExtShare"] = { $ne: false };

            if (req.query.room){
                Query["Room"] = { $eq: req.query.room.toString() };
            }
            if (req.query.tags){
                Query["Tags"] = new RegExp(escapeRegExp(req.query.tags).replace(/_/gi, "|"), 'i');
            }
            if (req.query.arlink){
                Query["Link"] = { $eq: req.query.arlink};
            }
            if (req.query.nick){
                Query["Nick"] = { $regex: new RegExp(req.query.nick, "i")};
            }
            if (req.query.link) {
                Query = {
                    $or : [ 
                        {"StreamLink": { $in: LinkArrayBuilder(parselink(req.query.link.toString())) }},
                        {"AuxLink": { $in: LinkArrayBuilder(parselink(req.query.link.toString())) }}
                    ],
                    ...Query
                }
            }

            RoomList = await LocalClient.db('Archive').collection('List').find(Query, {projection:{ _id: 0, Nick: 1, Link: 1, Pass: 1, Room: 1, AuxLink: 1, StreamLink: 1, Tags: 1, Star: 1, ExtShare: 1, Downloadable: 1}}).sort({$natural: -1}).skip(req.query.page*20).limit(20).toArray();
            return res.json(RoomList);
        }
    } catch (error){
        console.error(error);
    } finally {
    } 
})

app.post('/Archive/', async function (req, res) {
    if (req.body.TimeStamp != undefined){
        //------------------------------------------------------------- GET ONE ARCHIVE NATIVE APP -------------------------------------------------------------
        if (req.body.link == undefined){
            res.status(400).send("ERROR : NO LINK PROVIDED");
        } else if (req.body.Token  == undefined){
            res.status(400).send("ERROR : INVALID TOKEN");
        } else if ( Number(req.body.TimeStamp) == NaN ) {
            res.status(400).send("ERROR : INVALID TOKEN");
        } else  if ( Number(req.body.TimeStamp) < Date.now() - 10000) {
            res.status(400).send("ERROR : INVALID TOKEN");
        } else {
            if (req.body.Token != crypto.createHash('sha256').update(req.body.TimeStamp.toString() + "Y4g00B3stG1rl").digest('hex')) {
                res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                const db = client.db('Archive');
                var QueryRes = await LocalClient.db('Archive').collection('List').findOne({ $and: [{ Link: { $eq: req.body.link } }, { Hidden: { $eq: false} }] }, {projection:{ _id: 0, Pass: 1, Room: 1 }});
            
                if (QueryRes == null){
                    res.status(400).send("ERROR : ARCHIVE NOT FOUND");
                } else {
                    if (QueryRes.Pass){
                        var RoomName = QueryRes.Room;
                        if (req.body.pass == undefined){
                            res.status(400).send("ERROR : ARCHIVE IS PASSWORD PROTECTED, PLEASE SUBMIT PASSWORD IN THE PAYLOAD");
                        } else {
                            QueryRes = await db.collection('Pass').findOne({ $and: [{ Link: { $eq: req.body.link } }, { EntryPass: { $eq: req.body.pass } }] }, {projection:{ _id: 0}});
                            if (QueryRes == null){
                                res.status(400).send("ERROR : PASSWORD DOES NOT MATCH");
                            } else {
                                QueryRes = await db.collection(RoomName).findOne({ Link: { $eq: req.body.link } }, {projection:{ _id: 0, Link: 0}});
                                if (QueryRes == null){
                                    res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                                } else {
                                    res.status(200).send(AppendStreamStart(QueryRes.Entries));
                                }
                            }
                        }
                    } else {
                        QueryRes = await db.collection(QueryRes.Room).findOne({ Link: { $eq: req.body.link } }, {projection:{ _id: 0, Link: 0}});
                        if (QueryRes == null){
                            res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                        } else {
                            res.status(200).send(AppendStreamStart(QueryRes.Entries));
                        }
                    }
                }
            }
        }
        //============================================================= GET ONE ARCHIVE NATIVE APP =============================================================
    } else if (req.body.Token != undefined){
        if (req.body.Room != undefined){
            if (TokenRoom.indexOf(req.body.Room) == -1){
                res.status(400).send("ERROR : INVALID TOKEN");
            } else if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(req.body.Room)]).digest('hex') != req.body.Token){
                res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                //------------------------------------------------------------- TRANSLATOR ARCHIVE -------------------------------------------------------------
                const db = client.db('Archive');
                switch(req.body.Act){
                    case ('GetArchive'):
                        if(req.body.Page) {
                            var QueryRes = await LocalClient.db('Archive').collection('List').find({ Room: { $eq: req.body.Room } }, {projection:{ _id: 0}}).sort({$natural: -1}).toArray();
                            res.status(200).json({
                                Data: QueryRes.slice((req.body.Page - 1)*30, (req.body.Page*30)),
                                Total: QueryRes.length
                            });
                        } else {
                            var QueryRes = await LocalClient.db('Archive').collection('List').find({ Room: { $eq: req.body.Room } }, {projection:{ _id: 0}}).sort({$natural: -1}).toArray();
                            res.status(200).json(QueryRes);
                        }
                        break;
                    case ('GetArchiveInfo'):
                        if (req.body.Link == undefined){
                            res.status(400).send("ERROR : NO LINK PROVIDED");
                        } else {
                            var QueryRes = await LocalClient.db('Archive').collection('List').findOne({ Room: { $eq: req.body.Room }, Link: { $eq: req.body.Link}}, {projection:{ _id: 0}});
                            res.status(200).json(QueryRes);
                        } 
                        break;
                    case ('GetOne'):
                        if (req.body.Link == undefined){
                            res.status(400).send("ERROR : NO LINK PROVIDED");
                        } else {
                            var QueryRes = await db.collection(req.body.Room).findOne({ Link: { $eq: req.body.Link } }, {projection:{ _id: 0, Link: 0}});
                            if (QueryRes == null){
                                res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                            } else {
                                res.status(200).send(QueryRes.Entries);
                            }                        
                        } 
                        break;
                    case ('Delete'):
                        if (req.body.Link == undefined){
                            res.status(400).send("ERROR : NEED LINK");
                        } else {
                            clientmanager.db('Archive').collection("List").deleteOne({ $and: [{Link: { $eq: req.body.Link} }, { Room: { $eq: req.body.Room } }] });
                            Firebase.database().ref("Archived/" + req.body.Room).child("List").orderByChild("Link").equalTo(req.body.Link).once("value", function(data) {
                                if (data.val() != null){
                                    var keys = [];
                                    for(var k in data.val()) keys.push(k);
                                    Firebase.database().ref("Archived/" + req.body.Room + "/List").child(keys[0]).remove();
                                }
                            });

                            clientmanager.db('Archive').collection(req.body.Room).deleteOne({ Link: { $eq: req.body.Link} });
                            Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).remove();

                            clientmanager.db('Archive').collection("Pass").deleteOne({ Link: { $eq: req.body.Link} });
                            Firebase.database().ref("Archived/" + req.body.Room + "/EntryPass").child(req.body.Link).remove();

                            res.status(200).send("OK");
                        }
                        break;
                    case ('Edit'):
                        if ((req.body.Hidden == undefined) 
                            || (req.body.Link == undefined) 
                            || (req.body.Nick == undefined) 
                            || (req.body.Tags == undefined) 
                            || (req.body.Pass == undefined)
                            || (req.body.StreamLink == undefined)
                            || (req.body.Note == undefined)
                            || (req.body.Downloadable == undefined)){
                            res.status(400).send("ERROR : INCOMPLETE PARAMETER FOR EDIT");
                        } else {
                            if (req.body.ExtShare == undefined){
                                req.body.ExtShare = false;
                            }

                            if (!req.body.AuxLink) {
                                req.body.AuxLink = [];
                            }

                            if ((req.body.Pass == true) && (req.body.PassStr != undefined)) {
                                clientmanager.db('Archive').collection("List").updateOne({  $and: [{ Link: { $eq: req.body.Link}}, { Room: { $eq: req.body.Room } }] }, { $set: { Nick: req.body.Nick, Hidden: req.body.Hidden, Tags: req.body.Tags, ExtShare: req.body.ExtShare, Pass: true, StreamLink: req.body.StreamLink, AuxLink: req.body.AuxLink, Note: req.body.Note, Downloadable : req.body.Downloadable } });
                                Firebase.database().ref("Archived/" + req.body.Room).child("List").orderByChild("Link").equalTo(req.body.Link).once("value", function(data) {
                                    if (data.val() != null){
                                        var keys = [];
                                        for(var k in data.val()) keys.push(k);
                                        Firebase.database().ref("Archived/" + req.body.Room + "/List").child(keys[0]).set({
                                            Downloadable: req.body.Downloadable,
                                            Hidden: req.body.Hidden,
                                            Link: req.body.Link,
                                            Nick: req.body.Nick,
                                            PP: req.body.Pass
                                        });
                                    }
                                });

                                clientmanager.db('Archive').collection("Pass").updateOne({  Link: { $eq: req.body.Link} }, { $set: { EntryPass : crypto.createHash('sha256').update(req.body.PassStr).digest('hex') }}, {upsert: true});
                                Firebase.database().ref("Archived/" + req.body.Room + "/EntryPass").child(req.body.Link).set(req.body.PassStr);

                                res.status(200).send("OK");
                            } else {
                                clientmanager.db('Archive').collection("List").updateOne({  $and: [{ Link: { $eq: req.body.Link}}, { Room: { $eq: req.body.Room } }] }, { $set: { Nick: req.body.Nick, Hidden: req.body.Hidden, Tags: req.body.Tags, ExtShare: req.body.ExtShare, Pass: false, StreamLink: req.body.StreamLink, AuxLink: req.body.AuxLink, Note: req.body.Note, Downloadable : req.body.Downloadable } });
                                Firebase.database().ref("Archived/" + req.body.Room).child("List").orderByChild("Link").equalTo(req.body.Link).once("value", function(data) {
                                    if (data.val() != null){
                                        var keys = [];
                                        for(var k in data.val()) keys.push(k);
                                        Firebase.database().ref("Archived/" + req.body.Room + "/List").child(keys[0]).set({
                                            Downloadable: req.body.Downloadable,
                                            Hidden: req.body.Hidden,
                                            Link: req.body.Link,
                                            Nick: req.body.Nick
                                        });
                                    }
                                });

                                res.status(200).send("OK");
                            }
                        }
                        break;
                    case ('Update'):
                        if ((req.body.Link == undefined) || (req.body.Entries == undefined)){
                            res.status(400).send("ERROR : INCOMPLETE PARAMETER");
                        } else {
                            clientmanager.db('Archive').collection(req.body.Room).updateOne({ Link: { $eq: req.body.Link} }, {$set : {Entries : JSON.parse(req.body.Entries)}});
                            EntryList = JSON.parse(req.body.Entries);
                            var PushData = {};
                            for (i = 0; i <= EntryList.length; i++) {
                                if (i != EntryList.length){
                                    var newPostKey = Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).push().key;
                                    Object.keys(EntryList[i]).forEach(e => {
                                        if (EntryList[i][e] === undefined) {
                                          delete EntryList[i][e];
                                        }
                                      });
                                    PushData[newPostKey] = EntryList[i];
                                    PushData[newPostKey]["Stime"] = StringifyTime(PushData[newPostKey]["Stime"]);
                                } else {
                                    PushData["ExtraInfo"] = "";
                                    Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).set(PushData);
                                }
                            }

                            res.status(200).send("OK");
                        }
                        break;
                    case ('Add'):
                        if ((req.body.Hidden == undefined) 
                            || (req.body.Nick == undefined) 
                            || (req.body.Link == undefined) 
                            || (req.body.Tags == undefined) 
                            || (req.body.Pass == undefined)
                            || (req.body.StreamLink == undefined)
                            || (req.body.Entries == undefined)
                            || (req.body.Downloadable == undefined)){
                            res.status(400).send("ERROR : INCOMPLETE PARAMETER(S)");
                        } else {
                            if (req.body.ExtShare == undefined){
                                req.body.ExtShare = false;
                            }

                            if (req.body.Note == undefined){
                                req.body.Note = "";
                            }

                            if (!req.body.AuxLink) {
                                req.body.AuxLink = [];
                            }

                            if ((req.body.Pass == true) && (req.body.PassStr != undefined)) {
                                clientmanager.db('Archive').collection(req.body.Room).insertOne({ Link: req.body.Link, Entries: JSON.parse(req.body.Entries) });
                                EntryList = JSON.parse(req.body.Entries);
                                var PushData = {};
                                for (i = 0; i <= EntryList.length; i++) {
                                    if (i != EntryList.length){
                                        var newPostKey = Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).push().key;
                                        Object.keys(EntryList[i]).forEach(e => {
                                            if (EntryList[i][e] === undefined) {
                                              delete EntryList[i][e];
                                            }
                                          });
                                        PushData[newPostKey] = EntryList[i];
                                        PushData[newPostKey]["Stime"] = StringifyTime(PushData[newPostKey]["Stime"]);
                                    } else {
                                        PushData["ExtraInfo"] = "";
                                        Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).set(PushData);
                                    }
                                }

                                clientmanager.db('Archive').collection("List").insertOne({Room: req.body.Room, Link: req.body.Link, Nick: req.body.Nick, Hidden: req.body.Hidden, Tags: req.body.Tags, ExtShare: req.body.ExtShare, Pass: true, StreamLink: req.body.StreamLink, AuxLink: req.body.AuxLink, Note: req.body.Note, Downloadable : req.body.Downloadable});
                                Firebase.database().ref("Archived/" + req.body.Room).child("List").push().set({
                                    Downloadable: req.body.Downloadable,
                                    Hidden: req.body.Hidden,
                                    Link: req.body.Link,
                                    Nick: req.body.Nick,
                                    PP: req.body.Pass
                                });

                                clientmanager.db('Archive').collection("Pass").insertOne({ Link: req.body.Link, EntryPass : crypto.createHash('sha256').update(req.body.PassStr).digest('hex') }, {upsert: true});
                                Firebase.database().ref("Archived/" + req.body.Room + "/EntryPass").child(req.body.Link).set(req.body.PassStr);

                                res.status(200).send("OK");
                            } else {
                                clientmanager.db('Archive').collection(req.body.Room).insertOne({ Link: req.body.Link, Entries: JSON.parse(req.body.Entries) });
                                EntryList = JSON.parse(req.body.Entries);
                                var PushData = {};
                                for (i = 0; i <= EntryList.length; i++) {
                                    if (i != EntryList.length){
                                        var newPostKey = Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).push().key;
                                        Object.keys(EntryList[i]).forEach(e => {
                                            if (EntryList[i][e] === undefined) {
                                              delete EntryList[i][e];
                                            }
                                          });
                                        PushData[newPostKey] = EntryList[i];
                                        PushData[newPostKey]["Stime"] = StringifyTime(PushData[newPostKey]["Stime"]);
                                    } else {
                                        PushData["ExtraInfo"] = "";
                                        Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.Link).set(PushData);
                                    }
                                }

                                clientmanager.db('Archive').collection("List").insertOne({Room: req.body.Room, Link: req.body.Link, Nick: req.body.Nick, Hidden: req.body.Hidden, Tags: req.body.Tags, ExtShare: req.body.ExtShare, Pass: false, StreamLink: req.body.StreamLink, AuxLink: req.body.AuxLink, Note: req.body.Note, Downloadable : req.body.Downloadable});
                                Firebase.database().ref("Archived/" + req.body.Room).child("List").push().set({
                                    Downloadable: req.body.Downloadable,
                                    Hidden: req.body.Hidden,
                                    Link: req.body.Link,
                                    Nick: req.body.Nick
                                });

                                res.status(200).send("OK");
                                }
                        }
                        break;

                    default:
                        res.status(200).send("OK?");
                        break;
                }
                //============================================================= TRANSLATOR ARCHIVE =============================================================
            }
        } else {
            res.status(400).send("ERROR : NEED ROOM");
        }
    } else {
        if (req.body.link == undefined){
            res.status(400).send("ERROR : NO LINK PROVIDED");
        } else {
            //------------------------------------------------------------- GET ONE ARCHIVE -------------------------------------------------------------
            const db = client.db('Archive');
            var QueryRes = await LocalClient.db('Archive').collection('List').findOne({ $and: [{ Link: { $eq: req.body.link } }, { Hidden: { $eq: false} }, { ExtShare: { $ne: false } }] }, {projection:{ _id: 0, Pass: 1, Room: 1 }});
        
            if (QueryRes == null){
                res.status(400).send("ERROR : ARCHIVE NOT FOUND");
            } else {
                if (QueryRes.Pass){
                    var RoomName = QueryRes.Room;
                    if (req.body.pass == undefined){
                        res.status(400).send("ERROR : ARCHIVE IS PASSWORD PROTECTED, PLEASE SUBMIT PASSWORD IN THE PAYLOAD");
                    } else {
                        QueryRes = await db.collection('Pass').findOne({ $and: [{ Link: { $eq: req.body.link } }, { EntryPass: { $eq: req.body.pass } }] }, {projection:{ _id: 0}});
                        if (QueryRes == null){
                            res.status(400).send("ERROR : PASSWORD DOES NOT MATCH");
                        } else {
                            QueryRes = await db.collection(RoomName).findOne({ Link: { $eq: req.body.link } }, {projection:{ _id: 0, Link: 0}});
                            if (QueryRes == null){
                                res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                            } else {
                                res.status(200).send(AppendStreamStart(QueryRes.Entries));
                            }
                        }
                    }
                } else {
                    QueryRes = await db.collection(QueryRes.Room).findOne({ Link: { $eq: req.body.link } }, {projection:{ _id: 0, Link: 0}});
                    if (QueryRes == null){
                        res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                    } else {
                        res.status(200).send(AppendStreamStart(QueryRes.Entries));
                    }
                }
            }
            //============================================================= GET ONE ARCHIVE =============================================================
        }
    }
})

function AppendStreamStart(dt){
    if (dt.length == 0){
        return (dt);
    }

    if (dt.filter(e => (e.Stext.match(/--.*Stream.*Start.*--/i) != null)).length == 0){
        if (dt[0].Stime == 0){
            return (dt);
        } else if (dt[0].Stime < 24*60*60*1000){
            dt.unshift({
                Stext: "--- Stream Starts ---",
                Stime: 0                            
            });
            return(dt);
        } else {
            return(dt);
        }
    } else {
        return(dt);
    }
}

//======================================================== ARCHIVE HANDLER ========================================================



//------------------------------------------------------- SCHEDULE HANDLER ------------------------------------------------------
app.get('/Schedule/', async (req, res) => {
    const db = client.db('RoomList');
    if (req.query.room != undefined){
        var SchedData = await db.collection('Schedule').find({ Room: { $eq: req.query.room.toString() } }, {}).sort({Time: 1}).toArray();
        res.status(200).send(SchedData);
    } else if (req.query.link){
        var SchedData = await db.collection('Schedule').find({ Link: { $eq: req.query.link.toString() } }, {projection:{ _id: 0}}).sort({Time: 1}).toArray();
        res.status(200).send(SchedData);
    } else if (req.query.tags){
        var SchedData = await db.collection('Schedule').find({ Tags: new RegExp(escapeRegExp(req.query.tags).replace(/_/gi, "|"), 'i') }, {projection:{ _id: 0}}).sort({Time: 1}).toArray();
        res.status(200).send(SchedData);
    } else {
        var SchedData = await client.db("RoomList").collection('Schedule').find({ Time: {  $gt: (Date.now() - 2*24*3600*1000) } }).sort({Time: 1}).toArray();
        res.status(200).send(SchedData);
        /*
        res.status(200).send(ScheduleCache.filter((e) => {
            return (e["Time"] >= Date.now() - 24*3600*1000);
        }).map( (e) => {
            return ({
                Room: e["Room"],
                Link: e["Link"],
                Note: e["Note"],
                Time: e["Time"],
                Tag: e["Tag"]
            })
        }));
        */
    }
})

app.get('/Schedule/Recent', async (req, res) => {
    const db = client.db('RoomList');
    var SchedData = await db.collection('Schedule').find({ Time: {  $lt: Date.now() } }, {projection:{ _id: 0}}).sort({Time: 1}).limit(20).toArray();
    res.status(200).send(SchedData);
})

app.post('/Schedule/', async (req, res) => {
    if ((req.body.Act == undefined) || (req.body.Token == undefined) || (req.body.Room == undefined)){
        res.status(400).send("ERROR : INCOMPLETE PARAMETER");
    } else {
        if (TokenRoom.indexOf(req.body.Room) == -1){
            res.status(400).send("ERROR : INVALID TOKEN");
        } else {
            if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(req.body.Room)]).digest('hex') != req.body.Token){
                res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                switch(req.body.Act){
                    case ('Add'):
                        if ((req.body.Link == undefined) || (req.body.Note == undefined) || (req.body.Tag == undefined) || (req.body.Time == undefined)){
                            res.status(400).send("ERROR : INCOMPLETE PARAMETER FOR ADD");
                        } else {
                            if (isNaN(Number(req.body.Time))){
                                res.status(400).send("ERROR : INVALID TIME FORMAT");
                            } else {
                                clientmanager.db('RoomList').collection("Schedule").insertOne({ Room: req.body.Room, Link: req.body.Link, Note: req.body.Note, Time: Number(req.body.Time), Tag: req.body.Tag});
                                res.status(200).send("OK");
                            }
                        }
                        break;
                    case ('Edit'):
                        if ((req.body.id == undefined) || (req.body.Link == undefined) || (req.body.Note == undefined) || (req.body.Tag == undefined)){
                            res.status(400).send("ERROR : INCOMPLETE PARAMETER FOR EDIT");
                        } else {
                            if (req.body.Time == undefined) {
                                clientmanager.db('RoomList').collection("Schedule").updateOne({  $and: [{ _id: new ObjectId(req.body.id) }, { Room: { $eq: req.body.Room } }] }, { $set: { Link: req.body.Link, Note: req.body.Note, Tag: req.body.Tag } });
                                res.status(200).send("OK");
                            } else {
                                clientmanager.db('RoomList').collection("Schedule").updateOne({  $and: [{ _id: new ObjectId(req.body.id) }, { Room: { $eq: req.body.Room } }] }, { $set: { Link: req.body.Link, Note: req.body.Note, Tag: req.body.Tag, Time: req.body.Time } });
                                res.status(200).send("OK");
                            }
                        }
                        break;
                    case ('Delete'):
                        if (req.body.id == undefined){
                            res.status(400).send("ERROR : NEED ID");
                        } else {
                            clientmanager.db('RoomList').collection("Schedule").deleteOne({ $and: [{ _id: new ObjectId(req.body.id) }, { Room: { $eq: req.body.Room } }] });
                            res.status(200).send("OK");
                        }
                        break;
                    default:
                        res.status(200).send("OK?");
                        break;
                }
            }
        }
    }
})
//======================================================= SCHEDULE HANDLER ======================================================



//------------------------------------------------------- Account Handler ------------------------------------------------------- 
var TokenTime = [];
var TokenRoom = [];

app.post('/Login/', async function (req, res) {
    if ((req.body.Room != undefined) && (req.body.Token != undefined)){
        if (TokenRoom.indexOf(req.body.Room) != -1){
            if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(req.body.Room)]).digest('hex') == req.body.Token){
                res.status(200).send("OK");
            } else {
                res.status(400).send("ERROR : INVALID TOKEN");    
            }
        } else {
            res.status(400).send("ERROR : INVALID TOKEN");
        }
    } else if ((req.body.Room != undefined) && (req.body.Pass != undefined)) {
        if (req.body.Public != undefined){
            if (req.body.Public == true){
                var QueryRes = await client.db('WBData').collection('AccountList').findOne({ $and: [{ Nick: { $eq: req.body.Room } }, { Pass: { $eq: crypto.createHash('sha256').update(req.body.Pass).digest('hex') } }, { Token: { $exists: false } }] }, {projection:{ _id: 1, Role: 1}});

                if (QueryRes == null){
                    res.status(400).send("ERROR : WRONG PASSWORD OR ROOM");
                } else if (req.body.Tokenless != undefined){
                    res.status(200).send("OK");
                } else {
                    if (TokenRoom.indexOf(req.body.Room) == -1){
                        var tkn = Date.now().toString();
                        TokenTime.push(tkn);
                        TokenRoom.push(req.body.Room);
                        res.status(200).send('[{"Token":"' + crypto.createHash('sha256').update(tkn).digest('hex') +'", "Role":"' + QueryRes["Role"] + '"}]');
                    } else {
                        const idx = TokenRoom.indexOf(req.body.Room);
                        if (TokenTime[idx] < Date.now - 24*3600*1000) {
                            TokenTime[idx].splice(idx, 1);
                            TokenRoom[idx].splice(idx, 1);
    
                            const tkn = Date.now().toString();
                            TokenTime.push(tkn);
                            TokenRoom.push(req.body.Room);
                            res.status(200).send('[{"Token":"' + crypto.createHash('sha256').update(tkn).digest('hex') +'", "Role":"' + QueryRes["Role"] + '"}]');
                        } else {
                            res.status(200).send('[{"Token":"' + crypto.createHash('sha256').update(TokenTime[idx]).digest('hex') +'", "Role":"' + QueryRes["Role"] + '"}]');
                        }
                    }
                } 
            }
        } else {
            var QueryRes = await client.db('WBData').collection('AccountList').findOne({ $and: [{ Nick: { $eq: req.body.Room } }, { Pass: { $eq: crypto.createHash('sha256').update(req.body.Pass).digest('hex') } }, { Role: { $eq: "TL" } }] }, {projection:{ _id: 1}});

            if (QueryRes == null){
                res.status(400).send("ERROR : WRONG PASSWORD OR ROOM");
            } else if (req.body.Tokenless != undefined){
                res.status(200).send("OK");
            } else {
                if (TokenRoom.indexOf(req.body.Room) == -1){
                    var tkn = Date.now().toString();
                    TokenTime.push(tkn);
                    TokenRoom.push(req.body.Room);
                    res.status(200).send('[{"Token":"' + crypto.createHash('sha256').update(tkn).digest('hex') +'", "Role":"TL"}]');
                } else {
                    const idx = TokenRoom.indexOf(req.body.Room);
                    if (TokenTime[idx] < Date.now - 24*3600*1000) {
                        TokenTime[idx].splice(idx, 1);
                        TokenRoom[idx].splice(idx, 1);

                        const tkn = Date.now().toString();
                        TokenTime.push(tkn);
                        TokenRoom.push(req.body.Room);
                        res.status(200).send('[{"Token":"' + crypto.createHash('sha256').update(tkn).digest('hex') +'", "Role":"TL"}]');
                    } else {
                        res.status(200).send('[{"Token":"' + crypto.createHash('sha256').update(TokenTime[idx]).digest('hex') +'", "Role":"TL"}]');
                    }
                }
            } 
        }
    } else {
        res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
})

app.post('/Account/', async function (req, res) {
    if ((req.body.Act != undefined) && (req.body.BToken != undefined)){
        switch (req.body.Act) {
            case "SignUp":
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ $or: [{ Nick: { $eq: content["Nick"] } }, { Email: { $eq: content["Email"] } }] }, {projection:{ _id: 1}});

                    if (QueryRes != null){
                        res.status(400).send("Nick / Email is already used.");
                    } else {
                        var UniqueToken = crypto.createHash('sha256').update(Date.now().toString()).digest('hex');
                        clientmanager.db('WBData').collection('AccountList').insertOne({ Nick: content["Nick"], Pass: crypto.createHash('sha256').update(content["Pass"]).digest('hex'),  Email: content["Email"], TimeStamp: Date.now(), Token: UniqueToken});
                        
                        transporter.sendMail({
                                from: 'MChatBot@mchatx.org',
                                to: content["Email"],
                                subject: '[MChatx] Account Verivication',
                                text: 'Hello ' + content["Nick"] + ', welcome welcome! Your account has been set up in MChatx!\n\n'
                                    + 'But, you will need to verify your account before you can use it which you can do by accessing the link below:\n'
                                    + 'https://mchatx.org/verivy/' + UniqueToken + '\n\n'
                                    + 'The link will be active for 3 x 24 hours since this email is sent which then if you still have not verify your account, it will be deleted and you will have to reapply for a new account\n\n'
                                    + '* Please ignore or delete this email if you were not expecting it.\n\n'
                                    + 'Cheers!\nMChatx Team'
                            }, function(error, info){
                            if (error) {
                                console.log(error);
                            } 
                        }); 
                        
                        //console.log('https://mchatx.org/verivy/' + UniqueToken);

                        res.status(200).send("OK");
                    }
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;

            case 'ResetPass':
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ Email: { $eq: content["Email"] } }, {projection:{ _id: 1, Nick: 1}});

                    if (QueryRes == null){
                        res.status(400).send("Email not registered.");
                    } else {
                        var UniqueToken = crypto.createHash('sha256').update(Date.now().toString()).digest('hex').slice(0, 16);
                        clientmanager.db('WBData').collection('AccountList').updateOne({ Email: content["Email"]}, { $set: { Pass: crypto.createHash('sha256').update(UniqueToken).digest('hex') } });
                        
                        transporter.sendMail({
                                from: 'MChatBot@mchatx.org',
                                to: content["Email"],
                                subject: '[MChatx] Account Verivication',
                                text: 'Hello ' + QueryRes["Nick"] + ', it seems that we have received password reset request for MChatx account linked to this email.\n\n'
                                    + 'Your new pass is given as below:\n'
                                    + 'Nick : ' + QueryRes["Nick"] + '\n'
                                    + 'Password : ' + UniqueToken + '\n\n'
                                    + 'Though you can keep using that password, it is recommended to change it as soon as possible.\n\n'
                                    + '* Please ignore or delete this email if you were not expecting it.\n\n'
                                    + 'Cheers!\nMChatx Team'
                            }, function(error, info){
                            if (error) {
                                console.log(error);
                            } 
                        }); 

                        //console.log(UniqueToken);

                        res.status(200).send("OK");
                    }
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;

            case 'ChangeEmail':
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ $and: [{ Nick: { $eq: content["Nick"] } }, { Pass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }]}, {projection:{ _id: 1, Role: 1}});
                    if (QueryRes == null){
                        res.status(400).send("Nick and Pass doesn't match");
                    } else {
                        clientmanager.db('WBData').collection('AccountList').updateOne({ $and: [{ Nick: { $eq: content["Nick"] } }, { Pass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }]}, { $set: { Email: content["NewEmail"] } });
                        res.status(200).send("OK");
                    }
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;

            case 'ChangePass':
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ $and: [{ Nick: { $eq: content["Nick"] } }, { Pass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }]}, {projection:{ _id: 1, Role: 1}});
                    if (QueryRes == null){
                        res.status(400).send("Nick and Pass doesn't match");
                    } else {
                        if (QueryRes["Role"] == "TL"){
                            Firebase.database().ref("Room/" + content["Nick"]).child("Pass").set(content["NewPass"]);
                        }
                        clientmanager.db('WBData').collection('AccountList').updateOne({ $and: [{ Nick: { $eq: content["Nick"] } }, { Pass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }]}, { $set: { Pass: crypto.createHash('sha256').update(content["NewPass"]).digest('hex') } });
                        res.status(200).send("OK");
                    }
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;

            case 'ChangeFPInfo':
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    clientmanager.db('WBData').collection('AccountList').updateOne({ Nick: { $eq: content["Nick"] } }, { $set: { Note: content["Note"], Links: content["Links"] } });
                    res.status(200).send("OK");
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;

            case 'Get':
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ Nick: { $eq: content["Nick"] } }, {projection:{ _id: 1, Nick: 1, Email: 1, Role: 1, Note: 1, Links: 1}});
                    if (QueryRes == null){
                        res.status(400).send("NOTHING FOUND");
                    } else {
                        res.status(200).send(JSON.stringify(QueryRes));
                    }
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;
    

            case 'Delete':
                try {
                    var content = JSON.parse(TGDecoding(req.body.BToken));
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ $and: [{ Nick: { $eq: content["Nick"] } }, { Pass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }]}, {projection:{ _id: 1, Role: 1}});
                    clientmanager.db('WBData').collection('AccountList').deleteOne({ Nick: { $eq: content["Nick"] } });
                    if (QueryRes["Role"] == "TL"){
                        Firebase.database().ref("Room/" + content["Nick"]).remove();
                    }
                    res.status(200).send("OK");
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;

            case "Verivy": 
                try {
                    var QueryRes = await client.db('WBData').collection('AccountList').findOne({ Token: req.body.BToken }, {projection:{ _id: 1}});

                    if (QueryRes == null){
                        res.status(400).send("VERIFICATION TOKEN NOT FOUND");
                    } else {
                        clientmanager.db('WBData').collection("AccountList").updateOne({ Token: req.body.BToken }, { $unset: { Token: "", TimeStamp: "" } });
                        res.status(200).send("OK");
                    }
                } catch (error) {
                    res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                }
                break;
        }
    } else {
        res.status(400).send("STATE YOUR BUSINESS HERE HUMAN");
    }
})
//======================================================= Account Handler =======================================================



//------------------------------------------------------- AUXILIARY FUNCTION ------------------------------------------------------
var ClientVersion = { Ver : "0.9.19" };
var MSyncVersion = { Ver : "4.0.0" };

function LinkArrayBuilder(link){
    if (!link){
        return [];
    }
    var MatchList = link.match(/https:\/\/youtu.be\/|https:\/\/www.youtube.com\/watch\?v=/i);
    link = [link];

    if (MatchList != null){
        switch (MatchList[0]) {
            case "https:\/\/youtu.be\/":
                link.push(link[0].replace("https:\/\/youtu.be\/", "https:\/\/www.youtube.com\/watch\?v="));
                break;
        
            case "https:\/\/www.youtube.com\/watch\?v=":
                link.push(link[0].replace("https:\/\/www.youtube.com\/watch\?v=", "https:\/\/youtu.be\/"));
                break;
        }
    }

    return(link);
}

function parselink(linkstr){
    if (!linkstr){
        return "";
    }

    switch(linkstr.substring(0,3)){
        case "YT_":
            return("https://www.youtube.com/watch?v=" + linkstr.substring(3));
        case "TW_":
            return("https://www.twitch.tv/videos/" + linkstr.substring(3));
        case "TC_":
            return("https://twitcasting.tv/" + linkstr.split("/")[0].split("_")[1] + "/movie/" + linkstr.split("/")[1]);
        case "NL_":
            return("https://live2.nicovideo.jp/watch/" + linkstr.substring(3));
        case "NC_":
            return("https://www.nicovideo.jp/watch/" + linkstr.substring(3));
        case "BL_":
            return("https://www.bilibili.com/video/" + linkstr.substring(3));
        default:
            return(linkstr);
    }
  }

function ShortenLink(linkstr){
    if (!linkstr){
        return "";
    }

    if (linkstr.indexOf("https://www.youtube.com/watch?v=") != -1){
        return linkstr.replace("https://www.youtube.com/watch?v=", "YT_");
    } else if (linkstr.indexOf("https://youtu.be/") != -1){
        return linkstr.replace("https://youtu.be/", "YT_");
    } else if (linkstr.indexOf("https://www.twitch.tv/videos/") != -1){
        return linkstr.replace("https://www.twitch.tv/videos/", "TW_");
    } else if (linkstr.indexOf("https://live2.nicovideo.jp/watch/") != -1){
        return linkstr.replace("https://live2.nicovideo.jp/watch/", "NL_");
    } else if (linkstr.indexOf("https://www.nicovideo.jp/watch/") != -1){
        return linkstr.replace("https://www.nicovideo.jp/watch/", "NC_");
    } else if (linkstr.indexOf("https://www.bilibili.com/video/") != -1){
        return linkstr.replace("https://www.bilibili.com/video/", "BL_");
    } else if ((linkstr.indexOf("twitcasting.tv/") != -1) || (linkstr.indexOf("/movie/") != -1)){
        var UIDName = linkstr.substring(0, linkstr.indexOf("/movie/"));
        UIDName = UIDName.substring(UIDName.lastIndexOf("/") + 1);
        return "TC_" + UIDName + "/" + linkstr.substring(linkstr.indexOf("/movie/") + 7);
    } else {
        return (linkstr);
    }
}

app.get("/Version/", async (req, res) => {
    return(res.json(ClientVersion));
})

app.get("/MsyncVersion/", async (req, res) => {
    return(res.json(MSyncVersion));
})
//======================================================= AUXILIARY FUNCTION ======================================================



//------------------------------------------------------- CACHING + BROADCAST FUNCTION ------------------------------------------------------
var ArchiveWatcher;
var SubsList = [];

app.get('/SubscribeChanges', async function (req, res) {
        const newID = Date.now();
    
        res.writeHead(200, headers);
        res.write("data: { \"flag\":\"Connect\", \"content\":\"CONNECTED TO SERVER\"}\n\n");
    
        SubsList.push({
            id: newID,
            res
        });

        req.on('close', () => {
            console.log(`${clientId} Connection closed`);
            SubsList = SubsList.filter(client => client.id !== newID);
        });
    })

function InitArchiveCaching2 (){
    ArchiveWatcher = clientmanager.db("Archive").collection("List").watch(pipeline);
    ArchiveWatcher.on('change', (next) => {
        if (next.operationType == "insert"){
            if (next.fullDocument["StreamLink"] != "") {
                clientmanager.db("WBData").collection("Request").deleteMany({ Link : { $eq : ShortenLink(next.fullDocument["StreamLink"]) } });
            }
        } else if (next.operationType == "update") {
        } else if (next.operationType == "delete") {
            clientmanager.db("WBData").collection("Rating").deleteMany({ ARID : { $eq : next.documentKey._id.toString() } });
            clientmanager.db("WBData").collection("Comment").deleteMany({ ARID : { $eq : next.documentKey._id.toString() } });
        }
      });
}
    
//======================================================= CACHING + BROADCAST FUNCTION ======================================================



//------------------------------------------------------- REQUEST HANDLER ------------------------------------------------------
app.post('/Request', async function (req, res) {
    if (!req.body.BToken) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    try {
        var content = JSON.parse(TGDecoding(req.body.BToken));
    } catch (error) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    if (!content["Act"]) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    switch (content["Act"]) {
        case "Add":
            if (!content["Token"]){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
            if ((!content["Link"]) || (!content["Nick"])){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }

            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    var query = await client.db("WBData").collection("Request").find({ $and: [{ Link: { $eq: content["Link"] } }, { Entry: content["Nick"] } ] }, {projection:{ _id: 1, Entry: 0, Link: 0}}).toArray();
                    if (query.length != 0){
                        return res.status(200).send("Ok");
                    } else {
                        query = await client.db("WBData").collection("Request").find({ Link: { $eq: content["Link"] } }, {projection:{ _id: 1, Entry: 0, Link: 0}}).toArray();
                        if (query.length != 0){
                            clientmanager.db("WBData").collection("Request").updateOne(
                                { $and: [{ Link: { $eq: content["Link"] } }, { Entry: { $ne: content["Nick"] } } ] },
                                { $push: { Entry: content["Nick"] } },
                            )
                            return res.status(200).send("OK")
                        } else {
                            if ((!content["Title"]) || (!content["Author"])){
                                request.post({
                                    headers: {"Content-Type" : "application/json"},
                                    url:     'http://localhost:' + Config.ScraperPort.toString() + '/Request',
                                    json:    { UID : content["Link"] }
                                  }, function(error, response, body){
                                    if (error){
                                        return res.status(400).send("NOT OK");
                                    }
    
                                    content["Title"] = body["Title"];
                                    content["Author"] = body["Author"];
                            
                                    if (response.statusCode == 200){
                                        clientmanager.db("WBData").collection("Request").updateOne(
                                            { $and: [{ Link: { $eq: content["Link"] } }, { Entry: { $ne: content["Nick"] } } ] },
                                            { $push: { Entry: content["Nick"] }, $setOnInsert: { Title: content["Title"], Vtuber: content["Author"] } },
                                            { upsert: true }
                                        )
                                        return res.status(200).send("OK")
                                    } else {
                                        return res.status(400).send("INVALID LINK");
                                    }
                                  });
                            } else {
                                clientmanager.db("WBData").collection("Request").updateOne(
                                    { $and: [{ Link: { $eq: content["Link"] } }, { Entry: { $ne: content["Nick"] } } ] },
                                    { $push: { Entry: content["Nick"] }, $setOnInsert: { Title: content["Title"], Vtuber: content["Author"] } },
                                    { upsert: true }
                                )
                                return res.status(200).send("OK")
                            }
                        }                    
                    }
                }
            }
            break;

        case "Delete":
            if (!content["Token"]){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
            if ((!content["Link"]) || (!content["Nick"])){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
           
            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    clientmanager.db("WBData").collection("Request").updateOne(
                        { Link: { $eq: content["Link"] } },
                        { $pull: { Entry: content["Nick"] } },
                    )
                    return res.status(200).send("OK");
                }
            }
            break;
    
        case "Check":
            if ((!content["Link"]) || (!content["Nick"])){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
        
            var query = await client.db("WBData").collection("Request").find({ $and: [{ Link: { $eq: content["Link"] } }, { Entry: content["Nick"] } ] }, {projection:{ _id: 1, Entry: 0, Link: 0}}).toArray();
            if (query.length != 0){
                return res.status(200).send("True");
            } else {
                return res.status(200).send("False");
            }
            break;

        case "Request":
            if (!content["Nick"]){
                var ReqData = await client.db("WBData").collection("Request").aggregate([
                    { $match: {$expr: {$gt: [{$size: "$Entry"}, 0]}} },
                    { $sort: { _id : -1 } },
                    { $limit : 50 },
                    { $project: {
                        _id: false,
                        Link: 1,
                        Title: 1,
                        Vtuber: 1,
                        Sum: { $size: "$Entry" }
                    }}
                ]).toArray();
                return res.status(200).send(ReqData);
            } else {
                var ReqData = await client.db("WBData").collection("Request").aggregate([
                    { $match: {$expr: {$gt: [{$size: "$Entry"}, 0]}} },
                    { $sort : { _id : -1 } },
                    { $limit : 50 },
                    { $project: {
                        _id: false,
                        Link: 1,
                        Title: 1,
                        Vtuber: 1,
                        Sum: { $size: "$Entry" },
                        Sign : { $in: [ content["Nick"], "$Entry" ] }
                    }}
                ]).toArray();
                return res.status(200).send(ReqData);
            }
            break;

        default:
            return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            break;
    }
})
//======================================================= REQUEST HANDLER ======================================================



//------------------------------------------------------- RATING HANDLER ------------------------------------------------------
app.post('/Rating', async function (req, res) {
    if (!req.body.BToken) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    try {
        var content = JSON.parse(TGDecoding(req.body.BToken));
    } catch (error) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    if ((!content["Act"]) || (!content["Nick"]) || (!content["ARID"])){
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    switch (content["Act"]) {
        case "Add":
            if (!content["Token"]){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }

            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    var query = await client.db("WBData").collection("Rating").find({ $and: [{ ARID: { $eq: content["ARID"] } }, { Entry: content["Nick"] } ] }, {projection:{ _id: 1, Entry: 0, ARID: 0}}).toArray();
                    if (query.length != 0){
                        return res.status(200).send("Ok2");
                    } else {
                        clientmanager.db("WBData").collection("Rating").updateOne(
                            { $and: [{ ARID: { $eq: content["ARID"] } }, { Entry: { $ne: content["Nick"] } } ] },
                            { $push: { Entry: content["Nick"] } },
                            { upsert: true },
                            function (err, result) {
                                if ((result.matchedCount > 0) || (result.upsertedCount > 0)) {
                                    clientmanager.db("Archive").collection("List").updateOne(
                                        { _id : new ObjectId(content["ARID"])},
                                        { $inc: { Star: 1 } }
                                    )
                                }
                            }
                        )
                        return res.status(200).send("Ok");
                    }
                }
            }
            break;

        case "Delete":
            if (!content["Token"]){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
            
            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    clientmanager.db("WBData").collection("Rating").updateOne(
                        { ARID: { $eq: content["ARID"] } },
                        { $pull: { Entry: content["Nick"] } },
                        function (err, result) {
                            if (result.matchedCount > 0) {
                                clientmanager.db("Archive").collection("List").updateOne(
                                    { _id : new ObjectId(content["ARID"])},
                                    { $inc: { Star: -1 } }
                                )
                            }
                        }
                    )
                    return res.status(200).send("OK");
                }
            }
            break;
    
        case "Check":
            var query = await client.db("WBData").collection("Rating").find({ $and: [{ ARID: { $eq: content["ARID"] } }, { Entry: content["Nick"] } ] }, {projection:{ _id: 1, Entry: 0, Link: 0}}).toArray();
            if (query.length != 0){
                return res.status(200).send("True");
            } else {
                return res.status(200).send("False");
            }
            break;

        default:
            return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            break;
    }
})
//======================================================= RATING HANDLER ======================================================



//------------------------------------------------------- COMMENT HANDLER ------------------------------------------------------
app.post('/Comment', async function (req, res) {
    if (!req.body.BToken) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    try {
        var content = JSON.parse(TGDecoding(req.body.BToken));
    } catch (error) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    if (!content["Act"]) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    switch (content["Act"]) {
        case "Add":
            if ((!content["ARID"]) || (!content["Nick"]) || (!content["TStamp"]) || (!content["Token"]) || (!content["content"])){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }

            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    await clientmanager.db("WBData").collection("Comment").updateOne(
                        { ARID: { $eq: content["ARID"] } },
                        { $push: { Entry: { Nick: content["Nick"], TStamp: content["TStamp"], Content: content["content"] } } },
                        { upsert: true}
                    )
                    return res.status(200).send("OK");
                }
            }
            break;

        case "Edit":
            if ((!content["ARID"]) || (!content["Nick"]) || (!content["TStamp"]) || (!content["Token"]) || (!content["content"])){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }

            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    await clientmanager.db("WBData").collection("Comment").updateOne(
                        { ARID: { $eq: content["ARID"]}, "Entry.Nick": content["Nick"], "Entry.TStamp": content["TStamp"] },
                        { $set: { "Entry.$.Content": content["content"] } }
                    )
                    return res.status(200).send("OK");
                }
            }
            break;

        case "Delete":
            if ((!content["Nick"]) || (!content["Token"]) || (!content["TStamp"]) || (!content["ARID"])){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
           
            if (TokenRoom.indexOf(content["Nick"]) == -1){
                return res.status(400).send("ERROR : INVALID TOKEN");
            } else {
                if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(content["Nick"])]).digest('hex') != content["Token"]){
                    return res.status(400).send("ERROR : INVALID TOKEN");
                } else {
                    await clientmanager.db("WBData").collection("Comment").updateOne(
                        { ARID: { $eq: content["ARID"] } },
                        { $pull: { Entry: { Nick: content["Nick"] , TStamp: content["TStamp"] } } }
                    )
                    return res.status(200).send("OK");
                }
            }
            break;
    
        case "Request":
            if (!content["ARID"]){
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
            var ReqData = await client.db("WBData").collection("Comment").findOne( { ARID: { $eq: content["ARID"] } }, { _id:0, ARID: 0, Entry: {$slice: -25} });
            if (ReqData == null){
                return res.status(200).send("[]");
            } else {
                return res.status(200).send(ReqData["Entry"]);
            }
            break;

        default:
            return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            break;
    }
})
//======================================================= COMMENT HANDLER ======================================================



//------------------------------------------------------- ARCHIVE DETAIL HANDLER -------------------------------------------------------
app.post('/ArchiveCheck', async function (req, res) {
    if (!req.body.BToken) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    try {
        var content = JSON.parse(TGDecoding(req.body.BToken));
    } catch (error) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    if (!content["Link"]){
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    var query;
    if (!content["Nick"]){
        query = { $and: [{ Hidden: false }, { Link : { $eq: content["Link"] } }] };
    } else {
        query = { $and: [{ $or: [{ Room: { $eq: content["Nick"] }}, { Hidden: false } ] }, { Link : { $eq: content["Link"] } }] };
    }

    var ReqData = await client.db("Archive").collection("List").find( query, {projection:{ _id: 1, Nick: 1, Link: 1, Pass: 1, Room: 1, AuxLink: 1, StreamLink: 1, Tags: 1, Star: 1, Note: 1, ExtShare: 1, Downloadable: 1}}).toArray();
    if (ReqData.length != 1){
        return res.status(400).send("NOT OK");
    } else {
        return res.status(200).send(ReqData[0]);
    }

})
//======================================================= ARCHIVE DETAIL HANDLER =======================================================



//------------------- DANGER DYNAMIC SESSION SAVING -------------------
app.post('/AutoSave/', async function (req, res) {
    if (!req.headers.authorization){
        return res.status(400).send("NO");
    }

    if (req.headers.authorization.split(" ")[0] != "Bearer"){
        return res.status(400).send("NO2");
    }

    if (!req.body.Room){
        return res.status(400).send("HCL20");
    }

    req.body.Token = req.headers.authorization.split(" ")[1];

    if (TokenRoom.indexOf(req.body.Room) == -1){
        return res.status(400).send("ERROR : INVALID TOKEN");
    } else if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(req.body.Room)]).digest('hex') != req.body.Token){
        return res.status(400).send("ERROR : INVALID TOKEN");
    }
    
    //console.log(req.body);

    switch (req.body.Act) {
        case "INIT":
            var QueryRes = await LocalClient.db("LocalSession").collection("Session").findOne({ Room: req.body.Room });
            if (!QueryRes) {
                await LocalClient.db("LocalSession").collection("Session").insertOne({ Room: req.body.Room });
            } 
            return res.status(200).send("OK!");
            break;
        
        /*
        case "HRES":
            return res.status(200).send("OK!");
            break;

        case "ADD":
            if (!req.body.data.idx || !req.body.data.stime || !req.body.data.stext) {
                return res.status(400).send("not ok");
            }

            await LocalClient.db("LocalSession").collection("Session").updateOne({ Room: req.body.Room }, {
                $push: {
                    Entries: {
                        $each: [{
                            Stext: req.body.data.stext,
                            Stime: req.body.data.stime,
                            CC: req.body.data.CC,
                            OC: req.body.data.OC
                        }],
                        $position: req.body.data.idx
                    }
                }
            })
            return res.status(200).send("OK!");
            break;
        */
        
        case "SAVE":
            res.status(200).send("OK!");

            if (req.body.data.Link) {
                let ProcessedEntries = req.body.data.Entries.map(e => {
                    return {
                        Stime: e.Stime,
                        Stext: e.Stext,
                        CC: req.body.data.Profile[e.Prfidx].CC ? req.body.data.Profile[e.Prfidx].CC.slice(1) : undefined,
                        OC: req.body.data.Profile[e.Prfidx].OC ? req.body.data.Profile[e.Prfidx].OC.slice(1) : undefined
                    }
                })

                await clientmanager.db('Archive').collection(req.body.Room).updateOne({ Link: { $eq: req.body.data.Link} }, {$set : {
                    Entries : ProcessedEntries
                }});

                var PushData = {};
                for (i = 0; i <= ProcessedEntries.length; i++) {
                    if (i != ProcessedEntries.length){
                        var newPostKey = Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.data.Link).push().key;
                        Object.keys(ProcessedEntries[i]).forEach(e => {
                            if (ProcessedEntries[i][e] === undefined) {
                              delete ProcessedEntries[i][e];
                            }
                          });
                        PushData[newPostKey] = ProcessedEntries[i];
                        PushData[newPostKey]["Stime"] = StringifyTime(PushData[newPostKey]["Stime"]);
                    } else {
                        PushData["ExtraInfo"] = "";
                        Firebase.database().ref("Archived/" + req.body.Room).child("Chat_" + req.body.data.Link).set(PushData);
                    }
                }
            }

            await LocalClient.db("LocalSession").collection("Session").updateOne({ Room: req.body.Room }, {
                $set: {
                    Entries: req.body.data.Entries,
                    Profile: req.body.data.Profile,
                    Setting: req.body.data.Setting
                }
            })
            break;

        default:
            return res.status(200).send("OK NANORA?");
            break;
    }
})

app.post('/LastSession/', async function (req, res) {
    if (!req.headers.authorization){
        return res.status(400).send("NO");
    }

    if (req.headers.authorization.split(" ")[0] != "Bearer"){
        return res.status(400).send("NO2");
    }

    if (!req.body.Room){
        return res.status(400).send("HCL20");
    }

    req.body.Token = req.headers.authorization.split(" ")[1];

    if (TokenRoom.indexOf(req.body.Room) == -1){
        return res.status(400).send("ERROR : INVALID TOKEN");
    } else if (crypto.createHash('sha256').update(TokenTime[TokenRoom.indexOf(req.body.Room)]).digest('hex') != req.body.Token){
        return res.status(400).send("ERROR : INVALID TOKEN");
    }
    
    const QueryRes = await LocalClient.db("LocalSession").collection("Session").findOne({ Room: req.body.Room }, {projection:{ _id: 0, Entries: 1, Profile: 1, Setting: 1 }})

    return res.status(200).send(QueryRes);

})

//=================== DANGER DYNAMIC SESSION SAVING ===================



//------------------------ TSUGE GUSHI ENCODING------------------------
function TGEncoding(input){
    var output = "";
    var key = "";
    var teethsize = 0;
    var head = 0;

    while (head == 0){
        head = Date.now() % 100;
    }
    
    input = input.replace(/([^\x00-\x7F]|\%)+/g, SelectiveURIReplacer);
    output = Buffer.from(input, 'binary').toString('base64');

    key = head.toString();
    
    teethsize = Math.floor(output.length*3.0/4.0);
    for (var i  = 0; i <= head; i++){
        output = output.slice(teethsize) + output.slice(0, teethsize);
    }
    
    for (var i = 0; i <= head; i++){
        if ((/[a-zA-Z]/).test(output[i])){
            key += output[i];
            break;
        }
    }

    for (; key.length < output.length;){
        var TeethLoc = Math.floor(Math.random()*output.length);
        var Halfend = output.slice(TeethLoc);
        output = output.slice(0, TeethLoc);
        key += TeethLoc.toString();
          
        if (Date.now() % 2 == 0){
          key += "~";
        } else {
          key += "|";
        }
  
        key += Halfend[0];
  
          
        Halfend = Halfend.slice(1);
    
        for (var i = 0;((Date.now() % 2 == 0) && (i < 5));i++){
            if (Halfend.length != 0){
                key += Halfend.slice(0,1);
                Halfend = Halfend.slice(1);
            }
            if (key.length > output.length + Halfend.length){
              break;
            }
        }
    
        output += Halfend;
        if (Date.now() % 2 == 0){
            key += "_";
        } else {
            key += "\\";
        }
    
        if (key.length >= output.length){
            break;
        }
    }

    for (var i = 0; ((i < 3) || (Date.now() % 2 != 0)) && (i < key.length/3.0); i++){
        var incision = Math.floor(Math.random()*output.length);
        if (Date.now() % 2 == 0){
            output = output.slice(0, incision) + "~" + output.slice(incision);
        } else {
            output = output.slice(0, incision) + "_" + output.slice(incision);
        }
    }

    output = output + " " + key;
    
    head = Math.floor((Date.now() % 100) * 16.0 / 100.0);
    teethsize = Math.floor(output.length*3.0/4.0);
    for (var i = 0; i <= head; i++){
        output = output.slice(teethsize) + output.slice(0, teethsize);
    }
  
    key = head.toString(16);
    output = key + output;

    return (output);
}
    
function TGDecoding(input) {
    var teeth = Number.parseInt(input.slice(0, 1), 16);
    input = input.slice(1);

    var teethsize = input.length - Math.floor(input.length*3.0/4.0);
    for (var i = 0; i <= teeth; i++){
        input = input.slice(teethsize) + input.slice(0, teethsize);
    }

    var output = input.split(" ")[0];
    output = output.replace(/~|_/g, "");
    var key = input.split(" ")[1];

    var cutloc = 0;
    for (cutloc = 0; cutloc < key.length; cutloc++){
        if ((/[a-zA-Z]/).test(key[cutloc])){
            break;
        }
    }
    
    teeth = Number.parseInt(key.slice(0,cutloc));
    
    key = "\\" + key.slice(cutloc + 1);
  
    var cutstring = "";
    var cutstring2 = "";
    
    for (var taking = false; key.length > 0;){
        if((key.slice(-1) == "_") || (key.slice(-1) == "\\")) {
            if (cutstring == ""){
              cutloc = 0
            } else {
              cutloc = Number.parseInt(cutstring);
            }
            output = output.slice(0, cutloc) + cutstring2 + output.slice(cutloc);
            cutstring = "";
            cutstring2 = "";
            taking = false;
        } else if ((key.slice(-1) == "~") || (key.slice(-1) == "|")) {
            taking = true;
        } else if (taking){
            cutstring = key.slice(-1) + cutstring;
        } else {
            cutstring2 = key.slice(-1) + cutstring2;
        }
        key = key.slice(0, key.length - 1);
    }

    teethsize = output.length - Math.floor(output.length*3.0/4.0);
    for (var i = 0; i <= teeth; i++){
        output = output.slice(teethsize) + output.slice(0, teethsize);
    }
    
    output = Buffer.from(output, 'base64').toString('binary');
    output = decodeURI(output);
    return (output);
}

function SelectiveURIReplacer(match){
    return(encodeURI(match));
}
//======================== TSUGE GUSHI ENCODING ========================



async function InitServer() {
    await client.connect();
    await clientmanager.connect();
    await LocalClient.connect();
    InitArchiveCaching2();
    ClearSchedule();
    setInterval(ClearSchedule, 1000*3600*12);
    setInterval(ClearTokenList, 1000*3600);
    setInterval(ClearBroadcast, 1000*3600*24);

    app.listen(PORT, async function () {
        console.log(`Server initialized on port ${PORT}`);
    })
}

InitServer();

function StringifyTime(TimeStamp){
    var Timestring = "";
    var Stime = 0;
    var SString = "";
    
    Stime = Math.floor(TimeStamp/3600000);
    SString = Stime.toString();
    if (SString.length < 2){
      SString = "0"+SString;
    }
    Timestring += SString + ":";
    TimeStamp -= Stime*3600000;

    Stime = Math.floor(TimeStamp/60000);
    SString = Stime.toString();
    if (SString.length < 2){
      SString = "0"+SString;
    }
    Timestring += SString + ":";
    TimeStamp -= Stime*60000;

    Stime = Math.floor(TimeStamp/1000);
    SString = Stime.toString();
    if (SString.length < 2){
      SString = "0"+SString;
    }
    Timestring += SString;
    TimeStamp -= Stime*1000;

    Timestring += ":" + TimeStamp.toString();

    return(Timestring);
  }
  
function ClearSchedule() {
    clientmanager.db('RoomList').collection("Schedule").deleteMany({ Time: {  $lt: (Date.now() - 2*24*3600*1000) } });
    clientmanager.db('WBData').collection("AccountList").deleteMany({ TimeStamp: {  $lt: (Date.now() - 3*24*3600*1000) } });
    clientmanager.db('WBData').collection("Request").deleteMany({$expr: {$lt: [{$size:"$Entry"}, 1]}});
    clientmanager.db('WBData').collection("Rating").deleteMany({$expr: {$lt: [{$size:"$Entry"}, 1]}});
    clientmanager.db('WBData').collection("Comment").deleteMany({$expr: {$lt: [{$size:"$Entry"}, 1]}});
}

function ClearTokenList() {
    for (i = 0; i < TokenTime.length;){
        if (TokenTime[i] < Date.now - 2*24*3600*1000){
            TokenTime[i].splice(i, 1);
            TokenRoom[i].splice(i, 1);
        } else {
            i++;
        }
    }
}

function ClearBroadcast() {
    clientmanager.db('DiscordBot').collection("Broadcast").deleteMany( { } );
}