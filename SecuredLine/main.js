const express = require("express")
const bodyParser = require("body-parser")
const cors = require('cors')
const { MongoClient } = require("mongodb")
const crypto = require('crypto')
const Config = require('../Config/Config.json');

const ConnString = Config.MongoReader;
const client = new MongoClient(ConnString, { useUnifiedTopology: true, maxPoolSize: 200 });

const ConnStringManager = Config.MongoWriter;
const clientmanager = new MongoClient(ConnStringManager, { useUnifiedTopology: true, maxPoolSize: 20 });

const LocalStringManager = Config.MongoLocalProxy;
const LocalClient = new MongoClient(LocalStringManager, { useUnifiedTopology: true, maxPoolSize: 50000 });

var Firebase = require("firebase-admin");
var serviceAccount = require(Config.FirebaseCred);

Firebase.initializeApp({
  credential: Firebase.credential.cert(serviceAccount),
  databaseURL: Config.FirebaseDBURL
});

const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    "Access-Control-Allow-Origin": "*",
    'X-Accel-Buffering': 'no'
  };

const PORT = Config.SecuredPort
const app = express()
app.use(bodyParser.json( { limit: '20mb'} ))
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }))
app.use(cors());

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

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

//------------------------------------------------------- Fetch Raw ======================================================
app.post('/', async function (req, res) {
    if (!req.body.BToken) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    try {
        var content = JSON.parse(TGDecoding(req.body.BToken));
    } catch (error) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    if (!content["Act"]){
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    switch (content["Act"]) {
        case "ArchiveList":
            var Query = {};
            Query["Hidden"] = { $eq: false};

            if (!content["Page"]){
                content["Page"] = 0;
            } else {
                content["Page"] -= 1;
            }

            if (content["Page"] < 0){
                return res.status(400).send("ERROR: BAD REQUEST")
            }

            if (content["Room"]){
                Query["Room"] = { $eq: content["Room"] };
            }
            if (content["Link"]){
                Query["StreamLink"] = { $in: LinkArrayBuilder(parselink(content["Link"])) };
            }
            if (content["Tags"]){
                Query["Tags"] = new RegExp(escapeRegExp(content["Tags"]).replace(/ /gi, "|"), 'i');
            }
            if (content["ARLink"]){
                Query["Link"] = { $eq: content["ARLink"]};
            }
            if (content["Nick"]){
                Query["Nick"] = { $regex: new RegExp(content["Nick"], "i")};
            }
    
            var QueryRes = await LocalClient.db("Archive").collection('List').find(Query, {projection:{ _id: 1, Nick: 1, Link: 1, Pass: 1, Room: 1, StreamLink: 1, Tags: 1, Star: 1, ExtShare: 1, Downloadable: 1}}).sort({$natural: -1}).skip(content["Page"]*20).limit(20).toArray();
            return res.json({ BToken: TGEncoding(JSON.stringify(QueryRes))});
            break;

        case "ArchiveCount":
            var Query = {};
            Query["Hidden"] = { $eq: false};

            if (content["Room"]){
                Query["Room"] = { $eq: content["Room"] };
            }
            if (content["Link"]){
                Query["StreamLink"] = { $in: LinkArrayBuilder(parselink(content["Link"])) };
            }
            if (content["Tags"]){
                Query["Tags"] = new RegExp(escapeRegExp(content["Tags"]).replace(/ /gi, "|"), 'i');
            }
            if (content["ARLink"]){
                Query["Link"] = { $eq: content["ARLink"]};
            }
            if (content["Nick"]){
                Query["Nick"] = { $regex: new RegExp(content["Nick"], "i")};
            }
    
            var QueryRes = await LocalClient.db("Archive").collection('List').find(Query, {projection:{ _id: 1, Nick: 0, Link: 0, Pass: 0, Room: 0, StreamLink: 0, Tags: 0, Star: 0, ExtShare: 0, Downloadable: 0}}).count();
            QueryRes = Math.ceil(QueryRes/20)
            return res.json({ BToken: TGEncoding(JSON.stringify({ Total: QueryRes }))});
            break;

        case "GetArchive":
            if (!content["ARLink"]) {
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }
            
            var QueryRes = await LocalClient.db("Archive").collection('List').findOne({ $and: [{ Link: { $eq: content["ARLink"] } }, { Hidden: { $eq: false} }] }, {projection:{ _id: 0, Pass: 1, Room: 1 }});
            
            if (QueryRes == null){
                res.status(400).send("ERROR : ARCHIVE NOT FOUND");
            } else {
                if (QueryRes.Pass){
                    var RoomName = QueryRes.Room;
                    if (!content["Pass"]){
                        res.status(400).send("ERROR : ARCHIVE IS PASSWORD PROTECTED, PLEASE SUBMIT PASSWORD IN THE PAYLOAD");
                    } else {
                        QueryRes = await client.db("Archive").collection('Pass').findOne({ $and: [{ Link: { $eq: content["ARLink"] } }, { EntryPass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }] }, {projection:{ _id: 0}});
                        if (QueryRes == null){
                            res.status(400).send("ERROR : PASSWORD DOES NOT MATCH");
                        } else {
                            QueryRes = await client.db("Archive").collection(RoomName).findOne({ Link: { $eq: content["ARLink"] } }, {projection:{ _id: 0, Link: 0}});
                            if (QueryRes == null){
                                res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                            } else {
                                res.json({ BToken: TGEncoding(JSON.stringify(AppendStreamStart(QueryRes.Entries)))});
                            }
                        }
                    }
                } else {
                    QueryRes = await client.db("Archive").collection(QueryRes.Room).findOne({ Link: { $eq: content["ARLink"] } }, {projection:{ _id: 0, Link: 0}});
                    if (QueryRes == null){
                        res.status(400).send("ERROR : UNABLE TO FIND THE ENTRIES");
                    } else {
                        res.json({ BToken: TGEncoding(JSON.stringify(AppendStreamStart(QueryRes.Entries)))});
                    }
                }
            }
            break;
        
        case "TestPass":
            if ((!content["Type"]) || (!content["ID"])) {
                return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            }

            switch (content["Type"]) {
                case "Archive":
                    if (!content["Pass"]){
                        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                    }

                    var QueryRes = await client.db("Archive").collection('Pass').findOne({ $and: [{ Link: { $eq: content["ID"] } }, { EntryPass: { $eq: crypto.createHash('sha256').update(content["Pass"]).digest('hex') } }] }, {projection:{ _id: 1}});
                    if (QueryRes == null){
                        return res.status(200).send("NOPE");
                    } else {
                        return res.status(200).send("OK");
                    }
                    break;
                case "Room":
                    if (!content["Pass"]){
                        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                    }

                    var QueryRes = await client.db('RoomList').collection('Pass').findOne({ $and: [{ Nick: { $eq: content["ID"] } }, { EntryPass: { $eq: content["Pass"] } }] }, {projection:{ _id: 1}});
                    if (QueryRes == null){
                        return res.status(200).send("NOPE");
                    } else {
                        return res.status(200).send("OK");
                    }
                    break;
                
                case "PassRoom":
                    var QueryRes = await client.db('RoomList').collection('Pass').findOne({ $and: [{ Nick: { $eq: content["ID"] } }, { EntryPass: { $ne: '' } }] }, {projection:{ _id: 1}});
                    if (QueryRes == null){
                        return res.status(200).send("OK");
                    } else {
                        return res.status(200).send("NOPE");
                    }
                    break;

                default:
                    return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
                    break;
            }

            break;

        default:
            return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
            break;
    }
})

app.get('/', async function (req, res) {
    if (!req.query.BToken) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    try {
        var content = JSON.parse(TGDecoding(req.query.BToken));
    } catch (error) {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }

    if (!content["Act"]){
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
    
    if (content["Act"] == "Listen") {
        if (!content["Room"]){
            res.status(400).send("ERROR : NO ROOM PROVIDED");
        } else {
            var QueryRes = await LocalClient.db('RoomList').collection('List').findOne({ Nick: { $eq: content["Room"] } }, {projection:{ _id: 0, EntryPass: 1} });
         
            if (QueryRes == null){
                res.status(400).send("ERROR : ROOM NOT FOUND");
            } else {
                if (QueryRes.EntryPass){
                    if (!content["Pass"]){
                        res.status(400).send("ERROR : ROOM IS PASSWORD PROTECTED, PLEASE SUBMIT PASSWORD TOO");
                    } else {
                        QueryRes = await client.db('RoomList').collection('Pass').findOne({ $and: [{ Nick: { $eq: content["Room"] } }, { EntryPass: { $eq: content["Pass"] } }] }, {projection:{ _id: 0}});
                        if (QueryRes == null){
                            res.status(400).send("ERROR : PASSWORD DOES NOT MATCH");
                        } else {
                            AddListenerSecure(res, req, content["Room"]);
                        }
                    }
                } else {
                    AddListenerSecure(res, req, content["Room"]);
                }
            } 
        } 
    } else {
        return res.status(400).send("BAD REQUEST, BAD BAD REQUEST.");
    }
})

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

function AddListenerSecure(res, req, room){
    const newID = Date.now();
    const NewConn = {
        id: newID,
        res
    };

    res.writeHead(200, headers);
    res.write("data: { \"flag\":\"Connect\", \"content\":\"CONNECTED TO SECURE SERVER\"}\n\n");

    var indextarget = SeekRoom(room);
    if (indextarget != -1){
        ListenerPack[indextarget].ConnList.push(NewConn);
    } else {

        var Firesub = Firebase.database().ref("Session/Chat_" + room);
        
        Firesub.limitToLast(2).on("child_added", function(snapshot, prevChildKey) {
            const idx = SeekRoom(room);
            if (idx != -1){
                ListenerPack[idx].Active = true;
                if (snapshot.key != "ExtraInfo") {
                    var notif = snapshot.val();
                    notif["key"] = snapshot.key;
                    BroadcastSecure(idx, TGEncoding("{ \"flag\":\"insert\", \"content\": " + JSON.stringify(notif) + " }"));  
                }
            }
        });
    
        Firesub.on("child_changed", function(snapshot) {
            const idx = SeekRoom(room);
            if (idx != -1){
                ListenerPack[idx].Active = true;
                if (snapshot.val()["Stext"] == '--REDACTED--'){
                    BroadcastSecure(idx, TGEncoding("{ \"flag\":\"delete\", \"content\":\"" + snapshot.key + "\" }"));
                } else {
                    var notif = snapshot.val();
                    notif["key"] = snapshot.key;
                    BroadcastSecure(idx, TGEncoding("{ \"flag\":\"update\", \"content\": " + JSON.stringify(notif) + " }"));
                }
            }
        });

        ListenerPack.push({
            Active: true,
            BoolPool: 0,
            Room: room,
            ConnList: [NewConn],
            Watcher: Firesub
        })
    }

    req.on('close', () => {
        const idx = SeekRoom(room);
        if (idx != -1){
            ListenerPack[idx].ConnList = ListenerPack[idx].ConnList.filter(c => c.id !== newID);
            if (ListenerPack[idx].ConnList.length == 0){
                ListenerPack[idx].Watcher.off();
                ListenerPack[idx].Watcher.limitToLast(2).off();
                ListenerPack.splice(idx, 1);
            }
        }
    });
}

function BroadcastSecure(idx, data){
    ListenerPack[idx].ConnList.forEach(c => c.res.write("data:" + data + "\n\n"));
}

function PingerSecure() {
    for(i = 0; i < ListenerPack.length;){
        if (ListenerPack[i].Active){
            if (ListenerPack[i].ConnList.length == 0){
                ListenerPack[i].Watcher.off();
                ListenerPack[i].Watcher.limitToLast(2).off();
                ListenerPack.splice(i, 1);
            } else {
                ListenerPack[i].Active = false;
                ListenerPack[i].BoolPool = 0;
                i++;
            }
        } else {
            ListenerPack[i].BoolPool += 1;
            if (ListenerPack[i].BoolPool == 30){
                ListenerPack[i].Watcher.off();
                ListenerPack[i].Watcher.limitToLast(2).off();
                for(;ListenerPack[i].ConnList.length != 0;){
                    ListenerPack[i].ConnList[0].res.write("data: " +  TGEncoding("{ \"flag\":\"Timeout\", \"content\":\"Translator side time out\" }") + "\n\n");
                    ListenerPack[i].ConnList[0].res.end();
                    ListenerPack[i].ConnList.splice(0, 1);
                    if (ListenerPack[i].ConnList.length == 0){
                        ListenerPack.splice(i, 1);
                        break;
                    }
                }
            } else {
                BroadcastSecure(i, "{}");
                i++;
            }
        }
    }
}

function AppendStreamStart(dt){
    if (dt.length == 0){
        return (dt);
    }

    if (dt.filter(e => (e.Stext.match(/.*Stream.*Start.*/i) != null)).length == 0){
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
//======================================================= Fetch Raw ======================================================



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
    setInterval(PingerSecure, 1000*10);

    app.listen(PORT, async function () {
        console.log(`Server initialized on port ${PORT}`);
    })
}

InitServer();