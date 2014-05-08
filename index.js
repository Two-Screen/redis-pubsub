var util    = require('util');
var events  = require('events');
var hiredis = require('hiredis');


function Channel(port, host, chan) {
    this.pub = hiredis.createConnection(port, host);
    this.sub = hiredis.createConnection(port, host);
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
        var wasReady = this.ready;
        this.pub = null;
        this.destroy();
        if (wasReady) this.emit('close');
    }.bind(this));

    this.pub.on('error', function(err) {
        this.emit('error', err);
    }.bind(this));

    // Subscriber handling.
    this.sub.on('connect', function() {
        this.sub.write('subscribe', this.chan);
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
        var wasReady = this.ready;
        this.sub = null;
        this.destroy();
        if (wasReady) this.emit('close');
    }.bind(this));

    this.sub.on('error', function(err) {
        this.emit('error', err);
    }.bind(this));
}
util.inherits(Channel, events.EventEmitter);


Channel.prototype.destroy = function() {
    this.ready = this._pubReady = this._subReady = false;

    if (this.pub) {
        this.pub.destroy();
        this.pub = null;
    }

    if (this.sub) {
        this.sub.destroy();
        this.sub = null;
    }
};


Channel.prototype.send = function(message) {
    if (!this.raw)
        message = JSON.stringify(message);
    this.pub.write('PUBLISH', this.chan, message);
};


exports.createChannel = function(port, host, chan) {
    return new Channel(port, host, chan);
};
