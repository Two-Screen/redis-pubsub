var net     = require('net');
var util    = require('util');
var events  = require('events');
var hiredis = require('hiredis');


// This function was taken and modified from hiredis. BSD licensed.
// Problem was that the default write method doesn't account for unicode.
function createConnection(port, host) {
    var s = net.createConnection(port || 6379, host);
    var r = new hiredis.Reader();

    s.command = function() {
        var i, args = arguments, length = args.length;
        var str = "*" + length + "\r\n";
        for (i = 0; i < length; i++) {
            var arg = args[i];
            str += "$" + Buffer.byteLength(arg) + "\r\n" + arg + "\r\n";
        }
        this.write(str);
    };

    s.on("data", function(data) {
        r.feed(data);
        while (true) {
            var reply;
            try {
                reply = r.get();
            }
            catch (err) {
                s.emit('error', err);
                s.destroy();
                break;
            }
            if (reply === undefined) {
                break;
            }
            s.emit("reply", reply);
        }
    });

    return s;
}


function Channel(port, host, chan) {
    this.pub = createConnection(port, host);
    this.sub = createConnection(port, host);
    this.chan = chan;
    this.raw = false;

    this.ready = false;
    this._pubReady = false;
    this._subReady = false;

    // Publisher handling.
    this.pub.on('connect', function() {
        this._pubReady = true;
        this.ready = this._subReady;
        if (this.ready) this.emit('connect');
    }.bind(this));

    this.pub.on('reply', function(reply) {
        if (reply instanceof Error)
            return this.pub.emit('error', reply);
        if (typeof(reply) !== 'number')
            return this.pub.emit('error', new Error("Bad pub reply"));
    }.bind(this));

    this.pub.on('close', function() {
        this.pub = null;
        this.destroy();
    }.bind(this));

    this.pub.on('error', function(err) {
        this.emit('error', err);
    }.bind(this));

    // Subscriber handling.
    this.sub.on('connect', function() {
        this.sub.command('subscribe', this.chan);
    }.bind(this));

    this.sub.on('reply', function(reply) {
        if (reply instanceof Error)
            return this.sub.emit('error', reply);
        if (!Array.isArray(reply))
            return badReply('sub', reply);
        if (reply[0] === 'subscribe') {
            if (this._subscribed || reply[1] !== this.chan || reply[2] !== 1)
                return this.sub.emit('error', new Error("Bad sub reply"));
            this._subReady = true;
            this.ready = this._pubReady;
            if (this.ready) this.emit('connect');
            return;
        }
        if (reply[0] === 'message') {
            if (reply[1] !== this.chan)
                return this.sub.emit('error', new Error("Bad sub reply"));
            var msg = reply[2];
            if (!this.raw) {
                try { msg = JSON.parse(msg); }
                catch (err) { return this.sub.emit('error', err); }
            }
            return this.emit('message', msg);
        }
        return this.sub.emit('error', new Error("Bad sub reply"));
    }.bind(this));

    this.sub.on('close', function() {
        this.sub = null;
        this.destroy();
    }.bind(this));

    this.sub.on('error', function(err) {
        this.emit('error', err);
    }.bind(this));
}
util.inherits(Channel, events.EventEmitter);


Channel.prototype.destroy = function() {
    var wasReady = this.ready;
    this.ready = this._pubReady = this._subReady = false;

    if (this.pub) {
        this.pub.destroy();
        this.pub = null;
    }

    if (this.sub) {
        this.sub.destroy();
        this.sub = null;
    }

    if (wasReady) this.emit('close');
};


Channel.prototype.send = function(message) {
    if (!this.raw)
        message = JSON.stringify(message);
    this.pub.command('publish', this.chan, message);
};


exports.createChannel = function(port, host, chan) {
    return new Channel(port, host, chan);
};
