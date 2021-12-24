const { MongoClient, ObjectId } = require("mongodb")
const Config = require('../Config/Config.json');

const ConnString = Config.MongoReader;
const client = new MongoClient(ConnString, { useUnifiedTopology: true, maxPoolSize: 20 });

const ConnStringManager = Config.MongoLocalProxy;
const LocalClient = new MongoClient(ConnStringManager, { useUnifiedTopology: true, maxPoolSize: 20 });

const pipeline = [
    {
        '$match': {  $or : [ { operationType: { $eq: 'insert' } }, { operationType: { $eq: 'delete' } }, { operationType: { $eq: 'update' } } ]},
    }
  ];

async function InitCaching(){
    await client.connect();
    await LocalClient.connect();    
    console.log("CACHING STARTED");
    var QueryRes;
    var QueryRes2;

    console.log("RESYNCING ROOM LIST");
    QueryRes = await client.db("RoomList").collection('List').find( {} ).toArray();
    QueryRes2 = await (await LocalClient.db("RoomList").collection('List').find( {}, {projection:{ _id: 1} } ).toArray()).map(e => {return e._id.toString()});
    for (var i = 0; i < QueryRes.length; i++){
        await LocalClient.db('RoomList').collection("List").replaceOne({ _id: new ObjectId(QueryRes[i]._id.toString()) }, QueryRes[i], {upsert: true} );
        if (QueryRes2.indexOf(QueryRes[i]._id.toString()) != -1){
            QueryRes2.splice(QueryRes2.indexOf(QueryRes[i]._id.toString()), 1);
        }
        console.log("Synced UPSERT " + i + "/" + QueryRes.length);
    }
    for (var i = 0; i < QueryRes2.length; i++){
        await LocalClient.db('RoomList').collection("List").deleteOne({ _id: new ObjectId(QueryRes2[i]) } );
        console.log("Synced DELETE " + i + "/" + QueryRes2.length);
    }
    console.log("DONE")

    console.log("RESYNCING ARCHIVE LIST");
    QueryRes = await client.db("Archive").collection('List').find( {} ).toArray();
    QueryRes2 = await (await LocalClient.db("Archive").collection('List').find( {}, {projection:{ _id: 1} } ).toArray()).map(e => {return e._id.toString()});
    for (var i = 0; i < QueryRes.length; i++){
        await LocalClient.db('Archive').collection("List").replaceOne({ _id: new ObjectId(QueryRes[i]._id.toString()) }, QueryRes[i], {upsert: true});
        if (QueryRes2.indexOf(QueryRes[i]._id.toString()) != -1){
            QueryRes2.splice(QueryRes2.indexOf(QueryRes[i]._id.toString()), 1);
        }
        console.log("Synced UPSERT " + i + "/" + QueryRes.length);
    }
    for (var i = 0; i < QueryRes2.length; i++){
        await LocalClient.db('Archive').collection("List").deleteOne({ _id: new ObjectId(QueryRes2[i]) } );
        console.log("Synced DELETE " + i + "/" + QueryRes2.length);
    }
    console.log("DONE")

    const RoomListHandle = client.db("RoomList").collection("List").watch(pipeline);
    RoomListHandle.on('change', (next) => {
        if (next.operationType == "insert"){
            LocalClient.db('RoomList').collection("List").replaceOne({ _id: next.documentKey._id }, next.fullDocument, {upsert: true});
        } else if (next.operationType == "update") {
            var deletelist = {};
            next.updateDescription.removedFields.forEach( e => { 
                deletelist[e] = "";
            });
            LocalClient.db('RoomList').collection("List").updateOne({ _id: next.documentKey._id }, { $set : next.updateDescription.updatedFields, $unset : deletelist }, {upsert: true});
        } else if (next.operationType == "delete") {
            LocalClient.db('RoomList').collection("List").deleteOne({ _id: next.documentKey._id });
        }
    });

    const ArchiveListHandle = client.db("Archive").collection("List").watch(pipeline);
    ArchiveListHandle.on('change', (next) => {
        if (next.operationType == "insert"){
            LocalClient.db('Archive').collection("List").replaceOne({ _id: next.documentKey._id }, next.fullDocument, {upsert: true});
        } else if (next.operationType == "update") {
            var deletelist = {};
            next.updateDescription.removedFields.forEach( e => { 
                deletelist[e] = "";
            });
            LocalClient.db('Archive').collection("List").updateOne({ _id: next.documentKey._id }, { $set : next.updateDescription.updatedFields, $unset : deletelist }, {upsert: true});
        } else if (next.operationType == "delete") {
            LocalClient.db('Archive').collection("List").deleteOne({ _id: next.documentKey._id });
        }
    });
    console.log("Actively syncing now");
}

InitCaching();