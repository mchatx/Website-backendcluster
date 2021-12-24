const Discord = require("discord.js");
const { MongoClient } = require("mongodb")
const http = require("http");
const axios = require("axios");
const Config = require("../Config/Config.json");

const ConnStringManager = Config.MongoWriter;
const client = new MongoClient(ConnStringManager, { useUnifiedTopology: true, maxPoolSize: 20 });
const pipeline = [
  {
      '$match': {  $or : [ { operationType: { $eq: 'insert' } }, { operationType: { $eq: 'delete' } }, { operationType: { $eq: 'update' } } ]},
  }
];

const DSclient = new Discord.Client();
const prefix = "!";
const SubscriberArray = [];
const PrefixesArray = [];

function ShowHelp(DSreq) {
  DSreq.reply(new Discord.MessageEmbed()
  .setColor('#32CD32')
  .setTitle('Help')
  .setDescription('List of usable commands.'
    + "\nUse \"[command] help\" to call for a detailed help."
    + "\n--------------------------------------------------------------------------")
  .addField("subscribe [mode] [scope]","For subscribing to the notification system, the notification will be sent to the channel where this command is called.")
  .addField("notif\_filter [mode] [type] <ChannelID/Room/Tag>","Set-up filter for the notification system")
  .addField("unsubscribe","Simply put, unsubscribe from the notification system.")
  .addField("status","Check if the channel is subscribed to the notification system."  
    + "\n--------------------------------------------------------------------------")
  .addField("listen <Room name>","Start bouncing translation from a room")
  .addField("stop-listening <Room name>","Stop bouncing translation from a room")
  .addField("auto-listen [mode] [type] <ChannelID/Room/Tag>","Set-up auto-listen system")
  .addField("seek <Stream Link>","Check if any room is translating a stream"
    + "\n--------------------------------------------------------------------------")
  .addField("!mchad-prefix (set) [prefix]",
    "Manage the prefix used for the bot in this server."
    + "\nUse empty query to check the currently used prefix for the server (ex : !mchad-prefix)"
    + "\n\n(set): for setting prefix, it will need [prefix] argument (ex : !mchad-prefix set !mchat)"
    + "\n")
  );
}

DSclient.on("message", async function(message) {
  if (message.author.bot) return;

  if (!message.guild) {
    return;
  }

  if (!message.guild.me.hasPermission("SEND_MESSAGES")) {
    return;
  }

  //-----------------------  UNPREFIX PART -----------------------
  if (message.content.startsWith("!mchad-prefix")) {
    const args = message.content.split(' ');
    var command = args.shift().toLowerCase();

    if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
      message.reply(new Discord.MessageEmbed()
      .setColor('#FF0000')
      .setDescription('Need server ADMIN privilege.')
      );
      return;
    }

    if (args.length == 0){
      var queryres =  PrefixesArray.filter(dt => dt.GuildID === message.guild.id);    

      if (queryres.length == 0){
        message.reply(new Discord.MessageEmbed()
        .setColor('#32CD32')
        .setDescription('No saved prefix in this server, default prefix [!] is active.')
      );
      } else {
        message.reply(new Discord.MessageEmbed()
        .setColor('#32CD32')
        .setDescription('Saved Prefix for this server  [' + queryres[0].Prefix + '].')
      );
      }
      return;
    }

    command = args.shift().toLowerCase();

    switch (command) {
      case "set":
        if (args.length == 0){
          message.reply(new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setDescription('No [prefix] argument is given, setting back to the default prefix [!]')
          );
          command = "!";
        } else {
          command = args.shift().toLowerCase();
        }
        if (PrefixesArray.filter(dt => dt.GuildID === message.guild.id).length == 0){
          client.db("DiscordBot").collection("Prefixes").insertOne({
            GuildID: message.guild.id,
            Prefixes: command
          });

          PrefixesArray.push({
            GuildID: message.guild.id,
            Prefix: command
          })
        } else {
          for (let i = 0; i < PrefixesArray.length; i++){
            if (PrefixesArray[i].GuildID == message.guild.id){
              PrefixesArray[i].Prefix = command;
              
              client.db("DiscordBot").collection("Prefixes").updateOne(
                { GuildID: { $eq: message.guild.id} },
                { $set: { Prefixes : command } }
              );
              break;
            }
          }
        }
        
        message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('Prefix for this server is set to [' + command +'].')
        );
        break;
    
      default:
        var queryres =  PrefixesArray.filter(dt => dt.GuildID === message.guild.id);    

        if (queryres.length == 0){
          message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('No saved prefix in this server, default prefix [!] is active.')
          );
        } else {
          message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('Saved Prefix for this server  [' + queryres[0].Prefix + '].')
          );
        }
        break;
    }
    return;
  } else if (message.content.startsWith("!help")) {
    ShowHelp(message);
    return;
  }
  //-----------------------  UNPREFIX PART -----------------------


  if (message.guild) {
    var queryres =  PrefixesArray.filter(dt => dt.GuildID === message.guild.id);
    var ActivePrefix;
    if (queryres.length == 0){
      ActivePrefix = prefix;
      if (!message.content.startsWith(prefix)) return;
    } else {
      ActivePrefix = queryres[0].Prefix;
      if (!message.content.startsWith(queryres[0].Prefix)) return;
    }
  } else {
    ActivePrefix = prefix;
    if (!message.content.startsWith(prefix)) return;
  }

  const commandBody = message.content.slice(ActivePrefix.length);
  const args = commandBody.split(' ');
  var command = args.shift().toLowerCase();
  
  switch (command) {
    //-------------------- PING --------------------
    case "ping":
      message.reply(new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setDescription('Pong.')
      );

      break;

    //-------------------- SUBSCRIBE --------------------
    case "subscribe":
      if ((!message.guild) || (!message.channel)) return;

      if (args.length == 0){
        SubscribeGuide(message);
      } else if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
        message.reply(new Discord.MessageEmbed()
        .setColor('#FF0000')
        .setDescription('Need server ADMIN privilege.')
        );
      } else {
        var mode = args.shift().toLowerCase();
        
        if (mode == "help"){
          SubscribeGuide(message);
          return;
        }
        
        var scope = "full";
        if (args.length != 0){
          scope = args.shift().toLowerCase();
        }

        if (mode.match(/archive|schedule|broadcast/) == null){
          message.reply(new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setDescription('Not recognized mode.')
          );
          return;
        }

        if (scope.match(/incoming-only|full|off/) == null){
          message.reply(new Discord.MessageEmbed()
            .setColor('#FF0000')
            .setDescription('Not recognized scope.')
          );
          return;
        }

        mode = mode.charAt(0).toUpperCase()+ mode.slice(1);

        if (SubscriberArray.filter(e => e["TargetClient"] == DSclient.channels.cache.get(message.channel.id)).length == 0){
          var ArrEl ={
            TargetClient: DSclient.channels.cache.get(message.channel.id),
            Archive : "off",
            Schedule : "off",
            Broadcast : "off"
          }

          ArrEl[mode] = scope;
          SubscriberArray.push(ArrEl);
          client.db('DiscordBot').collection("Subscribers").insertOne(ArrEl);

          if (scope == "off"){
            message.reply(new Discord.MessageEmbed()
              .setColor('#32CD32')
              .setDescription('Stopped subscribing to ' + mode + ' notification.')
            );
          } else {
            message.reply(new Discord.MessageEmbed()
              .setColor('#32CD32')
              .setDescription('Started subscribing to the ' + scope + ' notification system (' + mode + ').')
            );
          }
        } else {
          for(i = 0; i < SubscriberArray.length; i++){
            if (SubscriberArray[i]["TargetClient"] == DSclient.channels.cache.get(message.channel.id)){
              switch (mode) {
                case "Archive":
                  client.db('DiscordBot').collection("Subscribers").updateOne({ Address: message.channel.id }, { $set: { Archive: scope } });                  
                  break;
              
                case "Schedule":
                  client.db('DiscordBot').collection("Subscribers").updateOne({ Address: message.channel.id }, { $set: { Schedule: scope } });
                  break;

                case "Broadcast":
                  client.db('DiscordBot').collection("Subscribers").updateOne({ Address: message.channel.id }, { $set: { Broadcast: scope } });
                  break;
              }
              SubscriberArray[i][mode] = scope;

              if (scope == "off"){
                message.reply(new Discord.MessageEmbed()
                  .setColor('#32CD32')
                  .setDescription('Stopped subscribing to ' + mode + ' notification.')
                );
              } else {
                message.reply(new Discord.MessageEmbed()
                  .setColor('#32CD32')
                  .setDescription('Started subscribing to the ' + scope + ' notification system (' + mode + ').')
                );
              }
              break;
            }
          }
        }
      }
      break;

    //-------------------- UNSUBSCRIBE --------------------
    case "unsubscribe":
      if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
        message.reply(new Discord.MessageEmbed()
        .setColor('#FF0000')
        .setDescription('Need server ADMIN privilege.')
        );
      } else {
        if ((!message.guild) || (!message.channel)) return;

        for(i = 0; i < SubscriberArray.length; i++){
          if (SubscriberArray[i]["TargetClient"] == DSclient.channels.cache.get(message.channel.id)){
            SubscriberArray.splice(i , 1);
            client.db("DiscordBot").collection("Subscribers").deleteOne({ Address: { $eq: message.channel.id} });
            message.reply(new Discord.MessageEmbed()
              .setColor('#32CD32')
              .setDescription('Unsubscribe from the notification system.')
            );
            break;
          }
        }
      }
      break;

    //-------------------- STATUS --------------------
    case "status":
      if (!message.channel) return;
      if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
        message.reply(new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription('Need server ADMIN privilege.')
        );
      } else if (SubscriberArray.length == 0){
        message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('Not subscribed to the notification system.')
        );
      } else {   
        for(i = 0; i < SubscriberArray.length; i++){
          if (SubscriberArray[i]["TargetClient"] == DSclient.channels.cache.get(message.channel.id)){
            message.reply(new Discord.MessageEmbed()
              .setColor('#32CD32')
              .setDescription(`Subscribing status:\n
                Archive : ` + SubscriberArray[i]["Archive"] + `\n
                Schedule : ` + SubscriberArray[i]["Schedule"] + `\n
                Broadcast : ` + SubscriberArray[i]["Broadcast"] + `.\n`)
            );
            break;
          } else if (i == SubscriberArray.length - 1){
            message.reply(new Discord.MessageEmbed()
              .setColor('#32CD32')
              .setDescription('Not subscribed to the notification system.')
            );
          }
        }
      }
      break;

    //-------------------- PREFIX HANDLER --------------------
    case "mchad-prefix":
      if (!message.guild) return;
      if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
        message.reply(new Discord.MessageEmbed()
        .setColor('#FF0000')
        .setDescription('Need server ADMIN privilege.')
        );
        return;
      }

      if (args.length == 0){
        var queryres =  PrefixesArray.filter(dt => dt.GuildID === message.guild.id);    

        if (queryres.length == 0){
          message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('No saved prefix in this server, default prefix [!] is active.')
        );
        } else {
          message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('Saved Prefix for this server  [' + queryres[0].Prefix + '].')
        );
        }
        return;
      }

      command = args.shift().toLowerCase();

      switch (command) {
        case "set":
          if (args.length == 0){
            message.reply(new Discord.MessageEmbed()
              .setColor('#FF0000')
              .setDescription('No [prefix] argument is given, setting back to the default prefix [!]')
            );
            command = "!";
          } else {
            command = args.shift().toLowerCase();
          }
          if (PrefixesArray.filter(dt => dt.GuildID === message.guild.id).length == 0){
            client.db("DiscordBot").collection("Prefixes").insertOne({
              GuildID: message.guild.id,
              Prefixes: command
            });
  
            PrefixesArray.push({
              GuildID: message.guild.id,
              Prefix: command
            })
          } else {
            for (let i = 0; i < PrefixesArray.length; i++){
              if (PrefixesArray[i].GuildID == message.guild.id){
                PrefixesArray[i].Prefix = command;
                
                client.db("DiscordBot").collection("Prefixes").updateOne(
                  { GuildID: { $eq: message.guild.id} },
                  { $set: { Prefixes : command } }
                );
                break;
              }
            }
          }
          
          message.reply(new Discord.MessageEmbed()
            .setColor('#32CD32')
            .setDescription('Prefix for this server is set to [' + command +'].')
          );
          break;
      
        default:
          if (!message.guild) return;
          var queryres =  PrefixesArray.filter(dt => dt.GuildID === message.guild.id);    

          if (queryres.length == 0){
            message.reply(new Discord.MessageEmbed()
            .setColor('#32CD32')
            .setDescription('No saved prefix in this server, default prefix [!] is active.')
            );
          } else {
            message.reply(new Discord.MessageEmbed()
            .setColor('#32CD32')
            .setDescription('Saved Prefix for this server  [' + queryres[0].Prefix + '].')
            );
          }
          return;
          break;
      }

      break; 

    //-------------------- HELP --------------------
    case "help":
      ShowHelp(message);
      break;
    
    /*
    case "shoot":
      SubscriberArray.forEach((e) => {
        e["TargetClient"].send("SHOOT");
      })
      break;
    */

    //-------------------- ROOM INTERACTION ---------------------
    case "seek":
      if (args.length == 0){
        message.reply(new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription('Need stream link to seek.'
          + "\nFor easier query, use the contracted form. The following contractions are available"
          + "\nYT\\_ for Youtube (https://www.youtube.com/watch?v=[XXXXX] => YT\\_[XXXXX])"
          + "\nTW\\_ for Twitch (https://www.twitch.tv/[XXXXX] => TW\\_[XXXXX])"
          + "\nTC\\_ for Twitcast (https://twitcasting.tv/[XXXXX] => TC\\_[XXXXX])"
          + "\nNL\\_ for Niconico live (https://live2.nicovideo.jp/watch/[XXXXX] => NL\\_[XXXXX])"
          + "\nBL\\_ for Bilibili live (https://live.bilibili.com/[XXXXX] => BL\\_[XXXXX])"
          )
        );
      } else {
        command = "";
        while(args.length){
          command += args.shift() + " ";
        }
        command = command.trimEnd();
        http.get({
            method: 'GET',
            hostname: 'repo.mchatx.org',
            path: "/Room?link=" + encodeURIComponent(command),
            headers: {
                'Content-Type': 'application/json'
            }         
          }, res => {
            res.on('data', function(chunk) {
              let Jtest = JSON.parse(chunk.toString());
              let s = "";
              Jtest.forEach(e => {
                s += '\n' + e.Nick;
              });
              if (s == ""){
                message.reply(new Discord.MessageEmbed()
                  .setColor('#32CD32')
                  .setDescription('No room translating ' + parselivelink(command) + ' at the moment.')
                );
              } else {
                message.reply(new Discord.MessageEmbed()
                  .setColor('#32CD32')
                  .setDescription('Room(s) translating ' + parselivelink(command) + ' at the moment\n' + s)
                );
              }
            });
  
            res.on('end', function() {
            });
          }
        );
      }
      break;

    case "listen":
      if (args.length == 0){
        message.reply(new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription('Need to specify room.')
        );
      } else if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
        message.reply(new Discord.MessageEmbed()
        .setColor('#FF0000')
        .setDescription('Need server ADMIN privilege.')
        );
      } else {
        command = "";
        while(args.length){
          command += args.shift() + " ";
        }
        command = command.trimEnd();
        listen(encodeURIComponent(command), DSclient.channels.cache.get(message.channel.id));
      }
      break;
    
    case "stop-listening":
      if (args.length == 0){
        message.reply(new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription('Need to specify room.')
        );
      } else if (!message.member.hasPermission("ADMINISTRATOR") && !message.member.hasPermission("BAN_MEMBERS") && !message.member.hasPermission("KICK_MEMBERS")){
        message.reply(new Discord.MessageEmbed()
        .setColor('#FF0000')
        .setDescription('Need server ADMIN privilege.')
        );
      } else {
        command = "";
        while(args.length){
          command += args.shift() + " ";
        }
        command = command.trimEnd();
        command = encodeURIComponent(command);
        const uniqueID = DSclient.channels.cache.get(message.channel.id); 
        ListenerList = ListenerList.filter(e => ((e.room != command) || (e.TargetClient != uniqueID)));
        message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('Stopped listening to ' + decodeURIComponent(command))
        );
      }
      break;
    
    case "auto-listen":
      if (args.length == 0){
        AutoListenGuide(message);
        return;
      }

      command = args.shift().toLowerCase();
      
      switch (command) {
        case "help":
          AutoListenGuide(message);
          break;

        case "list":
          if (!message.channel) return;
          var QueryRes = await client.db('DiscordBot').collection('Subscribers').findOne({Address: message.channel.id}, {projection:{ _id: 0, SubChannel: 1, SubRoom: 1, SubTag: 1}});
          if (!QueryRes["SubChannel"]) {QueryRes["SubChannel"] = []};
          if (!QueryRes["SubRoom"]) {QueryRes["SubRoom"] = []};
          if (!QueryRes["SubTag"]) {QueryRes["SubTag"] = []};

          if (QueryRes["SubChannel"].length == 0) {QueryRes["SubChannel"].push("*Empty*")};
          if (QueryRes["SubRoom"].length == 0) {QueryRes["SubRoom"].push("*Empty*")};
          if (QueryRes["SubTag"].length == 0) {QueryRes["SubTag"].push("*Empty*")};

          var SubChannelString = "";
          var SubRoomString = "";
          var SubTagString = "";

          QueryRes["SubChannel"].forEach(e => {SubChannelString += "\n" + e.replace("_", "\\_")});
          QueryRes["SubRoom"].forEach(e => {SubRoomString += "\n" + e});
          QueryRes["SubTag"].forEach(e => {SubTagString += "\n" + e});

          message.reply(new Discord.MessageEmbed()
            .setColor('#32CD32')
            .setDescription('auto-listening to channels:' + SubChannelString + "\n\nauto-listening to rooms:" + SubRoomString + "\n\nTag filtering:" + SubTagString)
          );
          break;

        case "add":
          AddAutoListen(args, message);
          break;

        case "remove":
          RemoveAutoListen(args, message);
          break;
        
        default:
          message.reply(new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription('unrecognized command')
          );
          break;
      }
      break;

    case "notif_filter":
      if (args.length == 0){
        NotifGuide(message);
        return;
      }
  
      command = args.shift().toLowerCase();
        
      switch (command) {
        case "help":
          NotifGuide(message);
          break;

        case "list":
          if (!message.channel) return;
          var QueryRes = await client.db('DiscordBot').collection('Subscribers').findOne({Address: message.channel.id}, {projection:{ _id: 0, NotifChannel: 1, NotifRoom: 1, NotifTag: 1}});
          if (!QueryRes["NotifChannel"]) {QueryRes["NotifChannel"] = []};
          if (!QueryRes["NotifRoom"]) {QueryRes["NotifRoom"] = []};
          if (!QueryRes["NotifTag"]) {QueryRes["NotifTag"] = []};
  
          if (QueryRes["NotifChannel"].length == 0) {QueryRes["NotifChannel"].push("*Empty*")};
          if (QueryRes["NotifRoom"].length == 0) {QueryRes["NotifRoom"].push("*Empty*")};
          if (QueryRes["NotifTag"].length == 0) {QueryRes["NotifTag"].push("*Empty*")};
  
          var NotifChannelString = "";
          var NotifRoomString = "";
          var NotifTagString = "";
  
          QueryRes["NotifChannel"].forEach(e => {NotifChannelString += "\n" + e.replace("_", "\\_")});
          QueryRes["NotifRoom"].forEach(e => {NotifRoomString += "\n" + e});
          QueryRes["NotifTag"].forEach(e => {NotifTagString += "\n" + e});
  
          message.reply(new Discord.MessageEmbed()
            .setColor('#32CD32')
            .setDescription('auto-listening to channels:' + NotifChannelString + "\n\nauto-listening to rooms:" + NotifRoomString + "\n\nTag filtering:" + NotifTagString)
          );
          break;
  
        case "add":
          AddFilter(args, message);
          break;
  
        case "remove":
          RemoveFilter(args, message);
          break;
          
        default:
          message.reply(new Discord.MessageEmbed()
          .setColor('#FF0000')
          .setDescription('unrecognized command')
          );
          break;
        }
        break;      
    }

});

function SubscribeGuide(message){
  message.reply(new Discord.MessageEmbed()
  .setColor('#0099FF')
  .setDescription('Usage: subscribe [mode] [scope]'
    + "\n\n[mode]:"
    + "\narchive : Subscribe to archive list."
    + "\nschedule : Subscribe to schedule list."
    + "\nbroadcast : Subscribe to translation broadcast notification."
    + "\n\n[scope]:"
    + "\n(default) : full"
    + "\nfull : Notify too when there is a change or deletion."
    + "\nincoming-only : Only notify when there is a new entry."
    + "\noff : Turn off notification for this mode.")      
  );
}

function NotifGuide(message){
  message.reply(new Discord.MessageEmbed()
  .setColor('#0099FF')
  .setDescription('Usage: notif\_filter [mode] [type] <ChannelID/Room/Tag>'
    + "\n\n[mode]:"
    + "\nadd : add to filter list."
    + "\nremove : remove from filter list."
    + "\nlist : print the filter list in this channel."
    + "\n\n[type]:"
    + "\ntag : add/remove tag list."
    + "\nroom : add/remove room list."
    + "\nchannel : add/remove channel list."
    + "\nThe following contractions are available for channel mode"
    + "\nYT\\_ for Youtube (https://www.youtube.com/channel/[XXXXX] => YT\\_[XXXXX])"
    + "\nTW\\_ for Twitch (https://www.twitch.tv/[XXXXX] => TW\\_[XXXXX])"
    + "\nTC\\_ for Twitcast (https://twitcasting.tv/[XXXXX] => TC\\_[XXXXX])"
    + "\nNL\\_ for Niconico (https://ch.nicovideo.jp/[XXXXX] => NL\\_[XXXXX])"
    + "\nBL\\_ for Bilibili (https://space.bilibili.com/ => BL\\_[XXXXX])"
    + "\n\nEXAMPLE : notif\_filter add channel YT_UCuAXFkgsw1L7xaCfnd5JJOw")            
  );
}

function AutoListenGuide(message){
  message.reply(new Discord.MessageEmbed()
  .setColor('#FF0000')
  .setDescription('Usage: auto-listen [mode] [type] <ChannelID/Room/Tag>'
    + "\n\n[mode]:"
    + "\nadd : add ChannelID or Room to auto-listen or add tag filtering."
    + "\nremove : remove ChannelID or Room from auto-listen or remove a tag filter."
    + "\nlist : print the list that this channel is watching for auto-listen plus the active tag filter."
    + "\n\n[type]:"
    + "\ntag : add/remove tag list."
    + "\nroom : add/remove room list."
    + "\nchannel : add/remove channel list."
    + "\nThe following contractions are available for channel mode"
    + "\nYT\\_ for Youtube (https://www.youtube.com/channel/[XXXXX] => YT\\_[XXXXX])"
    + "\nTW\\_ for Twitch (https://www.twitch.tv/[XXXXX] => TW\\_[XXXXX])"
    + "\nTC\\_ for Twitcast (https://twitcasting.tv/[XXXXX] => TC\\_[XXXXX])"
    + "\nNL\\_ for Niconico (https://ch.nicovideo.jp/[XXXXX] => NL\\_[XXXXX])"
    + "\nBL\\_ for Bilibili (https://space.bilibili.com/ => BL\\_[XXXXX])"
    + "\n\nEXAMPLE : auto-listen add channel YT_UCuAXFkgsw1L7xaCfnd5JJOw")  
  );
}

//------------------------------------------------------- ROOM LISTENER FUNCTION ------------------------------------------------------
var ListenerList = [];

function listen(RoomName, ChannelID){
  if (ListenerList.filter(e => (e.room == RoomName)).length == 0){
    http.get({
        method: 'GET',
        hostname: 'repo.mchatx.org',
        path: "/Listener?room=" + RoomName,
        headers: {
            'Content-Type': 'text/event-stream'
         }         
      }, res => {
        res.on('data', function(chunk) {
          const s = chunk.toString().replace("data:", "").trim();
          if (s.indexOf('"flag":"delete"') == -1){
            let OKtest = true;
            let Jtest = {};
            try {
              Jtest = JSON.parse(s);  
            } catch (error) {
              OKtest = false;
              console.log(s + " ||| " + RoomName);
            }

            if (OKtest){
              switch (Jtest.flag) {
                case "connect":
                  ChannelID.send(new Discord.MessageEmbed()
                    .setColor('#32CD32')
                    .setDescription('Started listening to ' + decodeURIComponent(RoomName))
                  );
                  break;
                case "insert":
                  const BounceList = ListenerList.filter(e => (e.room == RoomName));
                  BounceList.forEach(e => {
                    try {
                      e["TargetClient"].send(decodeURIComponent(RoomName) + ": **" + Jtest.content.Stext + "**");  
                    } catch (error) {
                      if (ListenerList.indexOf(e) != -1){
                        ListenerList.splice(ListenerList.indexOf(e));
                      }
                    }
                  });
                  break;
                case "timeout":
                  res.emit('end');
                  break;
              }
            }
            
          }
        });

        res.on('end', function() {
          const BounceList = ListenerList.filter(e => (e.room == RoomName));
          BounceList.forEach(e => {
            e["TargetClient"].send(new Discord.MessageEmbed()
              .setColor('#32CD32')
              .setDescription('Stopped listening to ' + decodeURIComponent(RoomName))
            );
          });
          ListenerList = ListenerList.filter(e => (e.room != RoomName));
        });
      }
    );
  } else {
    ChannelID.send(new Discord.MessageEmbed()
      .setColor('#32CD32')
      .setDescription('Started listening to ' + decodeURIComponent(RoomName))
    );
  }

  const ListenerPack = {
    TargetClient: ChannelID,
    room: RoomName
  };

  if (ListenerList.filter(e => ((e.room == RoomName) && (e.TargetClient == ChannelID))).length == 0){
    ListenerList.push(ListenerPack);
  }
}
//======================================================= ROOM LISTENER FUNCTION ======================================================



//------------------------------------------------------- AUTO LISTEN HANDLER ------------------------------------------------------
async function AddAutoListen(args, message) {
  if (args.length == 0){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription(
      'Use "room" to add to auto-listen room list.'
      + '\n Use "channel" to add to auto-listen channel list.'
      + '\n Use "tag" to add tag filtering to the auto-listen system.')
    );
    return;
  }

  var command = args.shift().toLowerCase();
  var mode = "";

  if (command.match(/room|channel|tag/i)){
    mode = command;
  } else {
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('unrecognized mode')
    );
    return;
  }

  command = "";
  while(args.length){
    command += args.shift() + " ";
  }
  command = command.trimEnd();

  if (command == ""){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('Need to specify ' + mode)
    );
    return;
  }

  if (mode == "channel") {command = ShortenChannelLink(command);}

  var QueryCmd = {};
  var UpdateCmd = {};
  switch (mode) {
    case "room":
      QueryCmd = { $and: [{ Address: message.channel.id }, { SubRoom: command } ] };
      break;
  
    case "channel":
      QueryCmd = { $and: [{ Address: message.channel.id }, { SubChannel: command } ] };
      break;

    case "tag":
      QueryCmd = { $and: [{ Address: message.channel.id }, { SubTag: command } ] };
      break;
  }

  var query = await client.db("DiscordBot").collection("Subscribers").find( QueryCmd, {projection:{ _id: 1, NotifRoom: 0, NotifChannel: 0, NotifTag: 0, SubTag: 0, SubRoom: 0, SubChannel: 0, Archive: 0, Schedule: 0, Broadcast: 0}}).toArray();
  if (query.length != 0){
    message.reply(new Discord.MessageEmbed()
    .setColor('#32CD32')
    .setDescription('added ' + command +  ' in auto-listen ' + mode + ' list.')
    );
  } else {
      query = await client.db("DiscordBot").collection("Subscribers").find({ Address: message.channel.id }, {projection:{ _id: 1, NotifRoom: 0, NotifChannel: 0, NotifTag: 0, SubTag:0, SubRoom: 0, SubChannel: 0, Archive: 0, Schedule: 0, Broadcast: 0}}).toArray();
      switch (mode) {
        case "room":
          QueryCmd = { $and: [{ Address: message.channel.id }, { SubRoom: { $ne: command } } ] };
          break;
      
        case "channel":
          QueryCmd = { $and: [{ Address: message.channel.id }, { SubChannel: { $ne: command } } ] };
          break;
    
        case "tag":
          QueryCmd = { $and: [{ Address: message.channel.id }, { SubTag: { $ne: command } } ] };
          break;
      }

      if (query.length != 0){
        switch (mode) {
          case "room":
            UpdateCmd = { $push: { SubRoom: command } };
            break;
        
          case "channel":
            UpdateCmd = { $push: { SubChannel: command } };
            break;
      
          case "tag":
            UpdateCmd = { $push: { SubTag: command } };
            break;
        }

        client.db("DiscordBot").collection("Subscribers").updateOne(QueryCmd, UpdateCmd);
        message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('added ' + command +  ' in auto-listen ' + mode + ' list.')
        );
      } else {
        switch (mode) {
          case "room":
            UpdateCmd = { $push: { SubRoom: command }, $setOnInsert: { Address: message.channel.id, Archive : "off", Schedule : "off", Broadcast : "off" } };
            break;
        
          case "channel":
            UpdateCmd = { $push: { SubChannel: command }, $setOnInsert: { Address: message.channel.id, Archive : "off", Schedule : "off", Broadcast : "off" } };
            break;
      
          case "tag":
            UpdateCmd = { $push: { SubTag: command }, $setOnInsert: { Address: message.channel.id, Archive : "off", Schedule : "off", Broadcast : "off" } };
            break;
        }

        client.db("DiscordBot").collection("Subscribers").updateOne( QueryCmd, UpdateCmd, { upsert: true });
        message.reply(new Discord.MessageEmbed()
        .setColor('#32CD32')
        .setDescription('added ' + command +  ' in auto-listen ' + mode + ' list.')
        );
      }                    
  }
}

async function RemoveAutoListen(args, message) {
  if (args.length == 0){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription(
      'Use "room" to remove from auto-listen room list.'
      + '\n Use "channel" to remove from auto-listen channel list.'
      + '\n Use "tag" to remove from auto-listen tag filter.')
    );
    return;
  }

  var command = args.shift().toLowerCase();
  var mode = "";

  if (command.match(/room|channel|tag/i).length != 0){
    mode = command;
  } else {
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('unrecognized mode')
    );
    return;
  }

  command = "";
  while(args.length){
    command += args.shift() + " ";
  }
  command = command.trimEnd();
  if (command == ""){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('Need to specify ' + mode)
    );
    return;
  }

  var QueryCmd = {};
  switch (mode) {
    case "room":
      QueryCmd = { $pull: { SubRoom: command } };
      break;
  
    case "channel":
      QueryCmd = { $pull: { SubChannel: command } };
      break;

    case "tag":
      QueryCmd = { $pull: { SubTag: command } };
      break;
  }

  await client.db("DiscordBot").collection("Subscribers").updateOne(
    { Address: message.channel.id },
    QueryCmd,
  )
  message.reply(new Discord.MessageEmbed()
  .setColor('#32CD32')
  .setDescription('removed ' + command +  ' from auto-listen ' + mode + ' list.')
  );
}

async function InitAutoListen(room, UCID, tag){
  var Querycmd = {};
  if (UCID == undefined) {
    UCID = "NONE";
  } else if (UCID == "") {
    UCID = "NONE";
  }

  if (!tag) {tag = ""};
  
  if (tag == "") {
    Querycmd = { $and: [
      { $or: [{ SubTag: {$eq: []} }, { SubTag: { $exists: false } } ] },
      { $or: [{ SubRoom: room }, { SubChannel: UCID } ] }
    ]};
  } else {
    var taglist = [];
    tag.split(",").forEach(e => { taglist.push(e.trim()) });

    Querycmd = { $and: [
      { $or: [{ $or: [{ SubTag: {$eq: []} }, { SubTag: { $exists: false } } ]}, { SubTag: {$in: taglist } } ] },
      { $or: [{ SubRoom: room }, { SubChannel: UCID } ] }
    ]};
  }

  var QueryRes = await client.db("DiscordBot").collection("Subscribers").find( Querycmd, {projection:{ _id: 0, Address: 1}}).toArray();
  if (tag.indexOf("TEST") != -1) {QueryRes = QueryRes.filter(e => e.Address == "828890708005879808");}

  for (var i = 0; i < QueryRes.length; i++){
    var seekaddr = SubscriberArray.filter(e => e.Address == QueryRes[i].Address);
    if (seekaddr.length == 0){
      DSclient.channels.fetch(QueryRes[i].Address).then(channel => {
        listen(encodeURIComponent(room), channel);
      });
    } else {
      for (var j = 0; j < seekaddr.length; j++){
        listen(encodeURIComponent(room), seekaddr[j].TargetClient);
      }
    }
  }
}
//======================================================= AUTO LISTEN HANDLER ======================================================



//----------------------------------------------- NOTIFICATION FILTER HANDLER --------------------------------------------------
async function AddFilter(args, message) {
  if (args.length == 0){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription(
      'Use "room" to add room to the notification filter.'
      + '\n Use "channel" to add channel to the notification filter.'
      + '\n Use "tag" to add tag to the notification filter.')
    );
    return;
  }

  var command = args.shift().toLowerCase();
  var mode = "";

  if (command.match(/room|channel|tag/i).length != 0){
    mode = command;
  } else {
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('unrecognized mode')
    );
    return;
  }

  command = "";
  while(args.length){
    command += args.shift() + " ";
  }
  command = command.trimEnd();

  if (command == ""){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('Need to specify ' + mode)
    );
    return;
  }

  if (mode == "channel") {command = ShortenChannelLink(command);}

  var QueryCmd = {};
  var UpdateCmd = {};
  switch (mode) {
    case "room":
      QueryCmd = { $and: [{ Address: message.channel.id }, { NotifRoom: command } ] };
      break;
  
    case "channel":
      QueryCmd = { $and: [{ Address: message.channel.id }, { NotifChannel: command } ] };
      break;

    case "tag":
      QueryCmd = { $and: [{ Address: message.channel.id }, { NotifTag: command } ] };
      break;
  }

  var query = await client.db("DiscordBot").collection("Subscribers").find( QueryCmd, {projection:{ _id: 1, NotifRoom: 0, NotifChannel: 0, NotifTag: 0, SubTag:0, SubRoom: 0, SubChannel: 0, Archive: 0, Schedule: 0, Broadcast: 0}}).toArray();
  if (query.length != 0){
    message.reply(new Discord.MessageEmbed()
    .setColor('#32CD32')
    .setDescription('added ' + command +  ' in auto-listen ' + mode + ' list.')
    );
  } else {
      query = await client.db("DiscordBot").collection("Subscribers").find({ Address: message.channel.id }, {projection:{ _id: 1, NotifRoom: 0, NotifChannel: 0, NotifTag: 0, SubTag:0, SubRoom: 0, SubChannel: 0, Archive: 0, Schedule: 0, Broadcast: 0}}).toArray();
      switch (mode) {
        case "room":
          QueryCmd = { $and: [{ Address: message.channel.id }, { NotifRoom: { $ne: command } } ] };
          break;
      
        case "channel":
          QueryCmd = { $and: [{ Address: message.channel.id }, { NotifChannel: { $ne: command } } ] };
          break;
    
        case "tag":
          QueryCmd = { $and: [{ Address: message.channel.id }, { NotifTag: { $ne: command } } ] };
          break;
      }

      if (query.length != 0){
        switch (mode) {
          case "room":
            UpdateCmd = { $push: { NotifRoom: command } };
            break;
        
          case "channel":
            UpdateCmd = { $push: { NotifChannel: command } };
            break;
      
          case "tag":
            UpdateCmd = { $push: { NotifTag: command } };
            break;
        }

        client.db("DiscordBot").collection("Subscribers").updateOne(QueryCmd, UpdateCmd);
        message.reply(new Discord.MessageEmbed()
          .setColor('#32CD32')
          .setDescription('added ' + command +  ' in auto-listen ' + mode + ' list.')
        );
      } else {
        switch (mode) {
          case "room":
            UpdateCmd = { $push: { NotifRoom: command }, $setOnInsert: { Address: message.channel.id, Archive : "off", Schedule : "off", Broadcast : "off" } };
            break;
        
          case "channel":
            UpdateCmd = { $push: { NotifChannel: command }, $setOnInsert: { Address: message.channel.id, Archive : "off", Schedule : "off", Broadcast : "off" } };
            break;
      
          case "tag":
            UpdateCmd = { $push: { NotifTag: command }, $setOnInsert: { Address: message.channel.id, Archive : "off", Schedule : "off", Broadcast : "off" } };
            break;
        }

        client.db("DiscordBot").collection("Subscribers").updateOne( QueryCmd, UpdateCmd, { upsert: true });
        message.reply(new Discord.MessageEmbed()
        .setColor('#32CD32')
        .setDescription('added ' + command +  ' in auto-listen ' + mode + ' list.')
        );
      }                    
  }
}

async function RemoveFilter(args, message) {
  if (args.length == 0){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription(
      'Use "room" to remove a room from the notification filter.'
      + '\n Use "channel" to remove a channel from the notification filter.'
      + '\n Use "tag" to remove a tag from the notification filter.')
    );
    return;
  }

  var command = args.shift().toLowerCase();
  var mode = "";

  if (command.match(/room|channel|tag/i).length != 0){
    mode = command;
  } else {
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('unrecognized mode')
    );
    return;
  }

  command = "";
  while(args.length){
    command += args.shift() + " ";
  }
  command = command.trimEnd();
  if (command == ""){
    message.reply(new Discord.MessageEmbed()
    .setColor('#FF0000')
    .setDescription('Need to specify ' + mode)
    );
    return;
  }

  var QueryCmd = {};
  switch (mode) {
    case "room":
      QueryCmd = { $pull: { NotifRoom: command } };
      break;
  
    case "channel":
      QueryCmd = { $pull: { NotifChannel: command } };
      break;

    case "tag":
      QueryCmd = { $pull: { NotifTag: command } };
      break;
  }

  await client.db("DiscordBot").collection("Subscribers").updateOne(
    { Address: message.channel.id },
    QueryCmd,
  )
  message.reply(new Discord.MessageEmbed()
  .setColor('#32CD32')
  .setDescription('removed ' + command +  ' from auto-listen ' + mode + ' list.')
  );
}
//=============================================== NOTIFICATION FILTER HANDLER ==================================================



//------------------------------------------------------- CACHING + BROADCAST FUNCTION ------------------------------------------------------
var ArchiveWatcher;
var ScheduleWatcher;
var RoomWatcher;

function InitArchiveCaching (){
  ArchiveWatcher = http.get({
    method: 'GET',
    hostname: 'repo.mchatx.org',
    path: "/PubSub/Archive",
    headers: {
        'Content-Type': 'text/event-stream'
     }         
  }, res => {
    res.on('data', function(chunk) {
      let dt = JSON.parse(chunk.toString().replace("data:", "").trim());
      switch (dt.flag) {
        case "new":
          var Title = dt.content["Nick"];
          if (dt.content["Pass"] == true) Title = dt.content["Nick"] + " (Password Protected)";
          if (!dt.content["Tags"]) { 
            dt.content["Tags"]=""; 
          }
          
          var Msg = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Newly Uploaded Archive')
            .addFields(
              { name: 'Title', value: Title , inline: true},
              { name: 'Room', value: dt.content["Room"], inline: true }
            );
    
            if (dt.content["StreamLink"] != "") { Msg.addField('Stream Link', dt.content["StreamLink"]); }
            if (dt.content["AuxLink"]) {
              var MsgS = dt.content["AuxLink"].map(e => {
                return "• " + e;
              }).join("\n");
              if (MsgS != "") {
                Msg.addField("Collab Links", MsgS);
              }
            }

            if (!dt.content["StreamLink"]){ 
              BroadcastNewArchive(Msg, dt);
            } else {
              var UID = GetDataLink(dt.content["StreamLink"]);
              if (UID.Live == undefined){
                BroadcastNewArchive(Msg, dt);
              } else {
                var APITarget = "";
                if (UID.Live == true){
                  APITarget = 'http://localhost:' + Config.ScraperPort.toString() + '/Live/';
                } else {
                  APITarget = 'http://localhost:' + Config.ScraperPort.toString() + '/Request/';
                }
                axios.post(APITarget, {
                  UID: UID.Link
                })
                .then(res2 => {
                  if (res2.data.Author && res2.data.Title) { Msg.addField('Stream Detail', 'Streamer: ' + res2.data.Author + '\nStream Title: ' + res2.data.Title); }
                  dt["UCID"] = res2.data.UCID;
                  BroadcastNewArchive(Msg, dt);
                })
                .catch(error => {
                  BroadcastNewArchive(Msg, dt);
                });      
              }
            }
          break;

        case "change":
          var Title = dt.content["Nick"];
          if (dt.content["Pass"] == true) Title = dt.content["Nick"] + " (Password Protected)";
    
          var Msg = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle('Updated Archive')
            .addFields(
              { name: 'Title', value: Title },
              { name: 'Room', value: dt.content["Room"] }
          );
    
          if (dt.content["Tags"] != "") { Msg.addField('Tags', dt.content["Tags"]); }
          if (dt.content["StreamLink"] != "") { Msg.addField('Stream Link', dt.content["StreamLink"]); }
          if (dt.content["Downloadable"] == true) {
            Msg.addField('Downloadable Script', "YES")
          } else {
            Msg.addField('Downloadable Script', "NO");
          }

          SubscriberArray.filter(e => (e["Archive"] == "full")).forEach((e) => {
            e["TargetClient"].send(Msg);
          }) 
          break;
      }
    });

    res.on('end', async function() {
      await new Promise(r => setTimeout(r, 5000));
      InitArchiveCaching();
    });

    }
  );

  ArchiveWatcher.on('error', async function() {
    await new Promise(r => setTimeout(r, 5000));
    InitArchiveCaching();
  });
}

async function BroadcastNewArchive(Msg, dt) {
  if (dt.content["Tags"] != "") { Msg.addField('Tags', dt.content["Tags"]); }
  if (dt.content["Downloadable"] == true) {
    Msg.addField('Downloadable Script', "YES"
    + "\n\nYou can give star, download, or comment on the script from this webpage"
    + "\nhttps://mchatx.org/archivecard/" + encodeURIComponent(dt.content["Link"].toString()));
  } else {
    Msg.addField('Downloadable Script', "NO"
    + "\n\nYou can give star or comment on the script from this webpage"
    + "\nhttps://mchatx.org/archivecard/" + encodeURIComponent(dt.content["Link"].toString()));
  }

  var Querycmd = {};
  var UCID = dt.content["UCID"];
  if (UCID == undefined) {
    UCID = "NONE";
  } else if (UCID == "") {
    UCID = "NONE";
  }
  var tag = dt.content["Tags"];
  var room = dt.content["Room"];
  if (!tag) {tag = ""};
  
  if (tag == "") {
    Querycmd = { $and: [
      { $or: [{ NotifTag: {$eq: []} }, { NotifTag: { $exists: false } } ] },
      { $or: [{ $or: [{ NotifRoom: room }, { NotifChannel: UCID } ] }, { $and: [{ $or: [{ NotifRoom: {$eq: []} }, { NotifRoom: { $exists: false } } ] }, { $or: [{ NotifChannel: {$eq: []} }, { NotifChannel: { $exists: false } } ] } ] }] } 
    ]};
  } else {
    var taglist = [];
    tag.split(",").forEach(e => { taglist.push(e.trim()) });

    Querycmd = { $and: [
      { $or: [{ $or: [{ NotifTag: {$eq: []} }, { NotifTag: { $exists: false } } ]}, { NotifTag: {$in: taglist } } ] },
      { $or: [{ $or: [{ NotifRoom: room }, { NotifChannel: UCID } ] }, { $and: [{ $or: [{ NotifRoom: {$eq: []} }, { NotifRoom: { $exists: false } } ] }, { $or: [{ NotifChannel: {$eq: []} }, { NotifChannel: { $exists: false } } ] } ] }] } 
    ]};
  }

  var QueryRes = await client.db("DiscordBot").collection("Subscribers").find( { $and: [ Querycmd, { Archive: { $exists: true, $ne: "off" } } ] } , {projection:{ _id: 0, Address: 1}}).toArray();
  if (dt.content["Note"] == "TEST") {QueryRes = QueryRes.filter(e => e.Address == "828890708005879808");}

  for (var i = 0; i < QueryRes.length; i++){
    var seekaddr = SubscriberArray.filter(e => e.Address == QueryRes[i].Address);
    if (seekaddr.length == 0){
      DSclient.channels.fetch(QueryRes[i].Address).then(channel => {
        channel.TargetClient.send(Msg);
      });
    } else {
      for (var j = 0; j < seekaddr.length; j++){
        seekaddr[j].TargetClient.send(Msg);
      }
    }
  }
}

function InitScheduleCaching (){
  ScheduleWatcher = http.get({
    method: 'GET',
    hostname: 'repo.mchatx.org',
    path: "/PubSub/Schedule",
    headers: {
        'Content-Type': 'text/event-stream'
     }         
  }, res => {
    res.on('data', function(chunk) {
      let dt = JSON.parse(chunk.toString().replace("data:", "").trim());
      switch (dt.flag) {
        case "new":
          var Msg = new Discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle('New Scheduled TL')
          .addFields(
            { name: 'Room', value: dt.content["Room"] },
            { name: 'Link', value: dt.content["Link"] }
          );

          if (!dt.content["Link"]){
            BroadcastNewSchedule(Msg, dt);
          } else {
            var UID = GetDataLink(dt.content["Link"]);
            if (UID.Live == undefined){
              BroadcastNewSchedule(Msg, dt);
            } else {
              var APITarget = "";
              if (UID.Live == true){
                APITarget = 'http://localhost:' + Config.ScraperPort.toString() + '/Live/';
              } else {
                APITarget = 'http://localhost:' + Config.ScraperPort.toString() + '/Request/';
              }
              axios.post(APITarget, {
                UID: UID.Link
              })
              .then(res2 => {
                if (res2.data.Author && res2.data.Title) { Msg.addField('Stream Detail', 'Streamer: ' + res2.data.Author + '\nStream Title: ' + res2.data.Title); }
                dt["UCID"] = res2.data.UCID;
                BroadcastNewSchedule(Msg, dt);
              })
              .catch(error => {
                BroadcastNewSchedule(Msg, dt);
              });      
            }
          }
          break;

        case "change":
          var Msg = new Discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle('Changed Schedule')
          .addFields(
            { name: 'Room', value: dt.content["Room"] },
            { name: 'Link', value: dt.content["Link"] }
          );
  
          if (dt.content["Note"] != "") { Msg.addField('Note', dt.content["Note"]); }
          if (dt.content["Tag"] != "") { Msg.addField('Tags', dt.content["Tag"]); }
  
          SubscriberArray.filter(e => (e["Schedule"] == "full")).forEach((e) => {
            e["TargetClient"].send(Msg);
          })          
          break;
      }
    });

    res.on('end', async function() {
      await new Promise(r => setTimeout(r, 5000));
      InitScheduleCaching();
    });

    }
  );

  ScheduleWatcher.on('error', async function() {
    await new Promise(r => setTimeout(r, 5000));
    InitScheduleCaching();
  });
}

async function BroadcastNewSchedule(Msg, dt){
  if (dt.content["Note"] != "") { Msg.addField('Note', dt.content["Note"]); }
  if (dt.content["Tag"] != "") { Msg.addField('Tags', dt.content["Tag"]); }

  var Querycmd = {};
  var UCID = dt["UCID"];
  if (UCID == undefined) {
    UCID = "NONE";
  } else if (UCID == "") {
    UCID = "NONE";
  }
  var tag = dt.content["Tags"];
  var room = dt.content["Room"];
  if (!tag) {tag = ""};
  
  if (tag == "") {
    Querycmd = { $and: [
      { $or: [{ NotifTag: {$eq: []} }, { NotifTag: { $exists: false } } ] },
      { $or: [{ $or: [{ NotifRoom: room }, { NotifChannel: UCID } ] }, { $and: [{ $or: [{ NotifRoom: {$eq: []} }, { NotifRoom: { $exists: false } } ] }, { $or: [{ NotifChannel: {$eq: []} }, { NotifChannel: { $exists: false } } ] } ] }] } 
    ]};
  } else {
    var taglist = [];
    tag.split(",").forEach(e => { taglist.push(e.trim()) });

    Querycmd = { $and: [
      { $or: [{ $or: [{ NotifTag: {$eq: []} }, { NotifTag: { $exists: false } } ]}, { NotifTag: {$in: taglist } } ] },
      { $or: [{ $or: [{ NotifRoom: room }, { NotifChannel: UCID } ] }, { $and: [{ $or: [{ NotifRoom: {$eq: []} }, { NotifRoom: { $exists: false } } ] }, { $or: [{ NotifChannel: {$eq: []} }, { NotifChannel: { $exists: false } } ] } ] }] } 
    ]};
  }

  var QueryRes = await client.db("DiscordBot").collection("Subscribers").find( { $and: [ Querycmd, { Schedule: { $exists: true, $ne: "off" } } ] }, {projection:{ _id: 0, Address: 1}}).toArray();
  if (dt.content["Note"] == "TEST") {QueryRes = QueryRes.filter(e => e.Address == "828890708005879808");}
  
  for (var i = 0; i < QueryRes.length; i++){
    var seekaddr = SubscriberArray.filter(e => e.Address == QueryRes[i].Address);
    if (seekaddr.length == 0){
      DSclient.channels.fetch(QueryRes[i].Address).then(channel => {
        channel.TargetClient.send(Msg);
      });
    } else {
      for (var j = 0; j < seekaddr.length; j++){
        seekaddr[j].TargetClient.send(Msg);
      }
    }
  }
}

function InitBroadcastProxy (){
  RoomWatcher = http.get({
    method: 'GET',
    hostname: 'repo.mchatx.org',
    path: "/PubSub/Room",
    headers: {
        'Content-Type': 'text/event-stream'
     }         
  }, res => {
    res.on('data', function(chunk) {
      let dt = JSON.parse(chunk.toString().replace("data:", "").trim());
      switch (dt.flag) {
        case "new":
          var Msg = new Discord.MessageEmbed()
          .setColor('#0099ff')
          .setTitle('TL Broadcast')
          .setDescription('A translator just started broadcasting!!')
          .addFields(
            { name: 'Room', value: dt.content["Nick"] }
          );
          
          if (dt.content["EntryPass"] == true) { Msg.addField('Password Protected', "YES"); }
          if (dt.content["StreamLink"]) { Msg.addField('Link', dt.content["StreamLink"]); }
          if (dt.content["AuxLink"]) {
            var MsgS = dt.content["AuxLink"].map(e => {
              return "• " + e;
            }).join("\n");
            if (MsgS != "") {
              Msg.addField("Collab Links", MsgS);
            }
          }
        
          if (!dt.content["StreamLink"]){
            BroadcastNewTL(Msg, dt);

            if ((dt.content["ExtShare"] == true) && (dt.content["EntryPass"] != true)){
              InitAutoListen(dt.content["Nick"], "", dt.content["Tags"]);
            }  
          } else {
            var UID = GetDataLink(dt.content["StreamLink"]);
            if (UID.Live == undefined){
              BroadcastNewTL(Msg, dt);
  
              if ((dt.content["ExtShare"] == true) && (dt.content["EntryPass"] != true)){
                InitAutoListen(dt.content["Nick"], "", dt.content["Tags"]);
              }  
            } else {
              var APITarget = "";
              if (UID.Live == true){
                APITarget = 'http://localhost:' + Config.ScraperPort.toString() + '/Live/';
              } else {
                APITarget = 'http://localhost:' + Config.ScraperPort.toString() + '/Request/';
              }
              axios.post(APITarget, {
                UID: UID.Link
              })
              .then(res2 => {
                if (res2.data.Author && res2.data.Title) { Msg.addField('Stream Detail', 'Streamer: ' + res2.data.Author + '\nStream Title: ' + res2.data.Title); }
                dt["UCID"] = res2.data.UCID;
                BroadcastNewTL(Msg, dt);
  
                if ((dt.content["ExtShare"] == true) && (dt.content["EntryPass"] != true)){
                  InitAutoListen(dt.content["Nick"], res2.data.UCID, dt.content["Tags"]);
                }                
              })
              .catch(error => {
                BroadcastNewTL(Msg, dt);
  
                if ((dt.content["ExtShare"] == true) && (dt.content["EntryPass"] != true)){
                  InitAutoListen(dt.content["Nick"], "", dt.content["Tags"]);
                }  
              });      
            }
          }
          break;
      }
    });

    res.on('end', async function() {
      await new Promise(r => setTimeout(r, 5000));
      InitBroadcastProxy();
    });

    }
  );

  RoomWatcher.on('error', async function() {
    await new Promise(r => setTimeout(r, 5000));
    InitBroadcastProxy();
  });
}

async function BroadcastNewTL (Msg, dt) {
  if (dt.content["Note"]) { Msg.addField('Note', dt.content["Note"]); }
  if (dt.content["Tags"]) { Msg.addField('Tags', dt.content["Tags"]); }
  
  var Querycmd = {};
  var UCID = dt["UCID"];
  if (UCID == undefined) {
    UCID = "NONE";
  } else if (UCID == "") {
    UCID = "NONE";
  }
  var tag = dt.content["Tags"];
  var room = dt.content["Nick"];
  if (!tag) {tag = ""};
  
  if (tag == "") {
    Querycmd = { $and: [
      { $or: [{ NotifTag: {$eq: []} }, { NotifTag: { $exists: false } } ] },
      { $or: [{ $or: [{ NotifRoom: room }, { NotifChannel: UCID } ] }, { $and: [{ $or: [{ NotifRoom: {$eq: []} }, { NotifRoom: { $exists: false } } ] }, { $or: [{ NotifChannel: {$eq: []} }, { NotifChannel: { $exists: false } } ] } ] }] } 
    ]};
  } else {
    var taglist = [];
    tag.split(",").forEach(e => { taglist.push(e.trim()) });

    Querycmd = { $and: [
      { $or: [{ $or: [{ NotifTag: {$eq: []} }, { NotifTag: { $exists: false } } ]}, { NotifTag: {$in: taglist } } ] },
      { $or: [{ $or: [{ NotifRoom: room }, { NotifChannel: UCID } ] }, { $and: [{ $or: [{ NotifRoom: {$eq: []} }, { NotifRoom: { $exists: false } } ] }, { $or: [{ NotifChannel: {$eq: []} }, { NotifChannel: { $exists: false } } ] } ] }] } 
    ]};
  }

  var QueryRes = await client.db("DiscordBot").collection("Subscribers").find( { $and: [ Querycmd, { Broadcast: { $exists: true, $ne: "off" } } ] } , {projection:{ _id: 0, Address: 1}}).toArray();
  if (tag.indexOf("TEST") != -1) {QueryRes = QueryRes.filter(e => e.Address == "828890708005879808");}

  for (var i = 0; i < QueryRes.length; i++){
    var seekaddr = SubscriberArray.filter(e => e.Address == QueryRes[i].Address);
    if (seekaddr.length == 0){
      DSclient.channels.fetch(QueryRes[i].Address).then(channel => {
        channel.TargetClient.send(Msg);
      });
    } else {
      for (var j = 0; j < seekaddr.length; j++){
        seekaddr[j].TargetClient.send(Msg);
      }
    }
  }
}
//======================================================= CACHING + BROADCAST FUNCTION ======================================================

//------------------------------------------------------- LINK PARSER ------------------------------------------------------
function parselivelink(linkstr){
  if (!linkstr){
      return "";
  }

  switch(linkstr.substring(0,3)){
      case "YT_":
          return("https://www.youtube.com/watch?v=" + linkstr.substring(3));
      case "TW_":
          return("https://www.twitch.tv/" + linkstr.substring(3));
      case "TC_":
          return("https://twitcasting.tv/" + linkstr.split("/")[0].split("_")[1] + "/movie/" + linkstr.split("/")[1]);
      case "NL_":
          return("https://live2.nicovideo.jp/watch/" + linkstr.substring(3));
      case "BL_":
          return("https://live.bilibili.com/" + linkstr.substring(3));
      default:
          return(linkstr);
  }
}

function ShortenChannelLink(linkstr){
  if (!linkstr){
    return "";
  }

  if (linkstr.indexOf("https://www.youtube.com/channel/") != -1){
    return linkstr.replace("https://www.youtube.com/channel/", "YT_");
  } else if (linkstr.indexOf("https://www.twitch.tv/") != -1){
    return linkstr.replace("https://www.twitch.tv/", "TW_");
  } else if (linkstr.indexOf("https://ch.nicovideo.jp/") != -1){
    return linkstr.replace("https://ch.nicovideo.jp/", "NL_");
  } else if (linkstr.indexOf("https://twitcasting.tv/") != -1){
    return linkstr.replace("https://twitcasting.tv/", "TC_");
  } else if (linkstr.indexOf("https://space.bilibili.com/") != -1){
    return linkstr.replace("https://space.bilibili.com/", "BL_");
  } else {
    return (linkstr);
  }

}

function GetDataLink(linkstr){
  if (!linkstr){
    return "";
  }

  if (linkstr.indexOf("https://www.youtube.com/watch?v=") != -1){
    linkstr = linkstr.replace("https://www.youtube.com/watch?v=", "YT_");
    return ({
      Link: linkstr,
      Live: true
    });
  } else if (linkstr.indexOf("https://youtu.be/") != -1){
    linkstr = linkstr.replace("https://youtu.be/", "YT_");
    return ({
      Link: linkstr,
      Live: true
    });
  } else if (linkstr.indexOf("https://www.twitch.tv/videos/") != -1){
    linkstr = linkstr.replace("https://www.twitch.tv/videos/", "TW_");
    return ({
      Link: linkstr,
      Live: false
    });
  } else if (linkstr.indexOf("https://www.twitch.tv/") != -1){
    linkstr = linkstr.replace("https://www.twitch.tv/", "TW_");
    return ({
      Link: linkstr,
      Live: true
    });  
  } else if (linkstr.indexOf("https://www.nicovideo.jp/watch/") != -1){
    linkstr = linkstr.replace("https://www.nicovideo.jp/watch/", "TW_");
    return ({
      Link: linkstr,
      Live: false
    });  
  } else if (linkstr.indexOf("https://live2.nicovideo.jp/watch/") != -1){
    linkstr = linkstr.replace("https://live2.nicovideo.jp/watch/", "NL_");
    return ({
      Link: linkstr,
      Live: true
    });  
  } else if (linkstr.indexOf("https://live.nicovideo.jp/watch/") != -1){
    linkstr = linkstr.replace("https://live.nicovideo.jp/watch/", "NL_");
    return ({
      Link: linkstr,
      Live: true
    });  
  } else if (linkstr.indexOf("https://www.bilibili.com/video/") != -1){
    linkstr = linkstr.replace("https://www.bilibili.com/video/", "BL_");
    return ({
      Link: linkstr,
      Live: false
    });  
  } else if (linkstr.indexOf("https://live.bilibili.com/") != -1){
    linkstr = linkstr.replace("https://live.bilibili.com/", "BL_");
    return ({
      Link: linkstr,
      Live: true
    });  
  } else if (linkstr.indexOf("twitcasting.tv/") != -1){
    if (linkstr.indexOf("/movie/") != -1){
      var UIDName = linkstr.substring(0, linkstr.indexOf("/movie/"));
      UIDName = UIDName.substring(UIDName.lastIndexOf("/") + 1);
      linkstr = "TC_" + UIDName + "/" + linkstr.substring(linkstr.indexOf("/movie/") + 7);
      return ({
        Link: linkstr,
        Live: false
      });  
    } else {
      linkstr = linkstr.replace("twitcasting.tv/", "TC_");
      return ({
        Link: linkstr,
        Live: true
      });  
    }
  } else {
      return ({
        Link: linkstr
      });
  }
}

//======================================================= LINK PARSER ======================================================

async function DownloadSubscriberList(){
  var QueryRes = await client.db("DiscordBot").collection("Subscribers").find({}, {projection:{ _id: 0}}).toArray();
  QueryRes.forEach( e => {
    DSclient.channels.fetch(e["Address"]).then(channel => {
      if (!e["Archive"]){
        e["Archive"] = "off";
      }
      if (!e["Schedule"]){
        e["Schedule"] = "off";
      }
      if (!e["Broadcast"]){
        e["Broadcast"] = "off";
      }
      SubscriberArray.push({
        TargetClient: channel,
        Archive: e["Archive"],
        Schedule: e["Schedule"],
        Broadcast: e["Broadcast"],
        Address: e["Address"]
      }); 
    }).catch( err => {
      console.log("Channel address : " + e["Address"] + " permission not ok");
    });      
  })
  console.log("Subscriber List Downloaded");
}

async function DownloadPrefixesList(){
  var QueryRes = await client.db("DiscordBot").collection("Prefixes").find({}, {projection:{ _id: 0}}).toArray();
  QueryRes.forEach( e => {
    PrefixesArray.push({
      GuildID : e["GuildID"],
      Prefix: e["Prefixes"]
    });
  })
  console.log("Prefixes List Downloaded");
}

async function Init(){
  await client.connect();
  await DSclient.login(Config.BOT_TOKEN);
  InitScheduleCaching();
  InitArchiveCaching();
  InitBroadcastProxy();
  DownloadSubscriberList();
  DownloadPrefixesList();
}

Init();