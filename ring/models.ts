/// <reference path="signal.ts" />
module models {

    /**
     * A simulation world where time is progressed by continuous
     * calls to upate.
     */
    export interface World<T extends Node> {

        /**
         * Raised when a message is sent in any channel with the following
         * parameters.
         * msg: any - the message being sent
         * fr: Node - the node from which the message was sent
         * to: Node - the node to which the message was sent
         */
        messageWasSent: Signal;

        /**
         * Raised when a node is self-elected leader with the following
         * parameters.
         * node: Node - the leader
         */
        nodeDidBecomeLeader: Signal;

        /**
         * A monotonically increasing clock that will increase by 1 on each
         * call to update.
         */
        time: number;

        /**
         *  All nodes that are active in the world ordered in ring order.
         */
        nodes: T[];

        /**
         * Progress the simulation by one step.
         */
        update();
    }

    /**
     * The public API for a Node.
     */
    export interface Node {
        uid: number;
        leader: boolean;
    }

    /**
     * An interface that represents only the sending side of a channel.
     */
    interface Sender<T> {
        send(msg: T, origin: number);
    }

    /**
     * An interface that represents only the receiving side of a channel.
     */
    interface Receiver<T> {
        recv(): T;
    }

    /**
     * The underlying implementation of a channel.
     */
    class ChannelImpl<T> {

        /**
         * The message that was delivered to this channel via send.
         */
        private arrive: T = null;

        /**
         * The message currently available to the receiving side of the channel.
         */
        private depart: T = null;

        constructor(private world : WorldImpl<any>,
                    private fr: any,
                    private to: any) {
            world.chans.push(this);
        }

        /**
         * Send the message into the channel. The message will be available
         * on the receiving end only after update.
         */
        send(msg: T, origin: number) {
            this.arrive = msg;
            this.world.messageWasSent.raise(
                msg,
                this.fr,
                this.to,
                origin);
        }

        /**
         * Read the message from the channel.
         */
        recv() : T {
            return this.depart;
        }

        /**
         * Latches the message from the send side to the receive side of the
         * channel.
         */
        update() {
            this.depart = this.arrive;
            this.arrive = null;
        }
    }

    /**
     * The interface required by each implementation of a node.
     */
    interface NodeImpl extends Node {
        setup();
        update();
    }

    /**
     * The implementation of the simulation world.
     */
    class WorldImpl<T extends NodeImpl> {

        public messageWasSent = new Signal;

        public nodeDidBecomeLeader = new Signal;

        public time = 0;

        public nodes: T[] = [];

        /**
         * All active channels in the world.
         */
        chans: ChannelImpl<any>[] = [];

        public update() {
            var nodes = this.nodes,
                chans = this.chans;

            if (this.time == 0) {
                nodes.forEach((node: NodeImpl) => {
                    node.setup();
                });
            } else {
                chans.forEach((chan: ChannelImpl<any>) => {
                    chan.update();
                });

                nodes.forEach((node: NodeImpl) => {
                    node.update();
                });
            }

            this.time++;
        }
    }

    /**
     * Simple utility to perform Fischer-Yates shuffle on
     * an array.
     */
    var Shuffle = <T>(vals: T[]): T[]=> {
        for (var i = vals.length - 1; i > 0; i--) {
            var j = (Math.random() * i) | 0,
                t = vals[i];
            vals[i] = vals[j];
            vals[j] = t;
        }
        return vals;
    };

    /**
     * Generate a list of n uids [0,n) and shuffle them.
     */
    var MakeUids = (n: number) => {
        var uids: number[] = [];
        for (var i = 0; i < n; i++) {
            uids.push(i);
        }
        return Shuffle(uids);
    };

    /**
     * An implementation of the Le Lann, Chang, and Roberts * algorithm (LCR).
     */
    export module lcr {

        class NodeImpl {
            public leader = false;

            public toL: Sender<number>;
            public frR: Receiver<number>;

            constructor(private world: WorldImpl<NodeImpl>, public uid: number) {
                this.world.nodes.push(this);
            }

            setup() {
                this.toL.send(this.uid, this.uid);
            }

            update() {
                var uid = this.uid,
                    msg = this.frR.recv();
                if (msg > uid) {
                    this.toL.send(msg, msg);
                } else if (msg == uid) {
                    this.leader = true;
                    this.world.nodeDidBecomeLeader.raise(this);
                }
            }
        }

        export var New = (n: number) : World<Node> => {
            var world = new WorldImpl<NodeImpl>(),
                nodes = MakeUids(n).map((uid: number) => {
                    return new NodeImpl(world, uid);
                });

            nodes.forEach((fr: NodeImpl, i: number) => {
                var to = nodes[(i + 1) % n];
                fr.toL = to.frR = new ChannelImpl<number>(world, fr, to);
            });

            return world;
        }
    }

    /**
     * Bogus is simply a fake world with idle Nodes. This is just used
     * as a debugging aid for rendering.
     */
    export module bogus {
        class NodeImpl {
            leader: boolean;
            constructor(public world: WorldImpl<NodeImpl>, public uid: number) {
                world.nodes.push(this);
            }

            setup() {
            }

            update() {
            }
        }

        export var New = (n: number): World<Node> => {
            var world = new WorldImpl<NodeImpl>(),
                nodes = MakeUids(n).map((uid: number) => {
                    return new NodeImpl(world, uid);
                });
            return world;
        };
    }

    /**
     * An implementation of the Hirschberg and Sinclair algorithm (HS).
     */
    export module hs {
        class Msg {
            constructor(public uid: number,
                        public out: boolean,
                        public ttl: number) {
            }
        }

        class NodeImpl {
            private phase: number = 0;

            public leader: boolean = false;

            public toL: Sender<Msg>;
            public toR: Sender<Msg>;

            public frL: Receiver<Msg>;
            public frR: Receiver<Msg>;

            constructor(private world: WorldImpl<NodeImpl>,
                        public uid: number) {
                world.nodes.push(this);
            }

            setup() {
                var uid = this.uid,
                    phase = this.phase;
                this.toL.send({
                    uid: uid,
                    out: true,
                    ttl: Math.pow(2, phase)
                }, uid);
                this.toR.send({
                    uid: uid,
                    out: true,
                    ttl: Math.pow(2, phase)
                }, uid);
            }

            update() {
                var msgL = this.frL.recv(),
                    msgR = this.frR.recv(),
                    uid = this.uid;

                if (msgL != null) {
                    if (msgL.out) {

                        if (msgL.uid > uid) {
                            if (msgL.ttl > 1) {
                                this.toR.send({
                                    uid: msgL.uid,
                                    out: true,
                                    ttl: msgL.ttl - 1
                                }, msgL.uid);
                            } else {
                                this.toL.send({
                                    uid: msgL.uid,
                                    out: false,
                                    ttl: 1
                                }, msgL.uid);
                            }
                        } else if (msgL.uid == uid) {
                            this.leader = true;
                            this.world.nodeDidBecomeLeader.raise(this);
                        }
                    } else if (msgL.uid != uid) { // inbound
                        this.toR.send({
                            uid: msgL.uid,
                            out: false,
                            ttl: 1
                        }, msgL.uid);
                    }
                }

                if (msgR != null) {
                    if (msgR.out) {

                        if (msgR.uid > uid) {
                            if (msgR.ttl > 1) {
                                this.toL.send({
                                    uid: msgR.uid,
                                    out: true,
                                    ttl: msgR.ttl - 1
                                }, msgR.uid);
                            } else {
                                this.toR.send({
                                    uid: msgR.uid,
                                    out: false,
                                    ttl: 1
                                }, msgR.uid);
                            }
                        } else if (msgR.uid == uid) {
                            this.leader = true;
                            this.world.nodeDidBecomeLeader.raise(this);
                        }
                    } else if (msgR.uid != uid) {
                        this.toL.send({
                            uid: msgR.uid,
                            out: false,
                            ttl: 1
                        }, msgR.uid);
                    }
                }

                if (msgR != null && msgL != null
                        && msgR.uid == uid && msgL.uid == uid
                        && msgR.ttl == 1 && msgL.ttl == 1
                        && !msgR.out && !msgL.out) {
                    this.phase++;
                    this.setup();
                }
            }
        }

        export var New = (n: number): World<Node> => {
            var world = new WorldImpl<NodeImpl>(),
                nodes = MakeUids(n).map((uid: number) => {
                    return new NodeImpl(world, uid);
                });

            nodes.forEach((fr: NodeImpl, i: number) => {
                var to = nodes[(i + 1) % n];
                fr.toL = to.frR = new ChannelImpl<Msg>(world, fr, to);
                to.toR = fr.frL = new ChannelImpl<Msg>(world, to, fr);
            });

            return world;
        };
    }

    export module timeslice {
        class NodeImpl {
            public leader: boolean = false;

            public toL: Sender<number>;
            public frR: Receiver<number>;

            private hasReceived: boolean = false;

            constructor(public world: WorldImpl<NodeImpl>,
                        public uid: number) {
                world.nodes.push(this);
             }

           setup() {
           }

            update() {
                var uid = this.uid,
                    world = this.world,
                    time = world.time,
                    n = world.nodes.length,
                    s = (uid - 1) * n + 1,
                    msg = this.frR.recv();

                if (time == s && !this.hasReceived) {
                    this.leader = true;
                    world.nodeDidBecomeLeader.raise(this);
                    this.toL.send(uid, uid);
                } else if (msg != null && msg != uid) {
                    this.hasReceived = true;
                    this.toL.send(msg, msg);
                }
            }
        }

        export var New = (n: number): World<Node> => {
            var world = new WorldImpl<NodeImpl>(),
                nodes = MakeUids(n).map((uid: number) => {
                    return new NodeImpl(world, uid + 2);
                });

            nodes.forEach((fr: NodeImpl, i: number) => {
                var to = nodes[(i + 1) % n];
                fr.toL = to.frR = new ChannelImpl<number>(world, fr, to);
            });
            return world;
        };
    }

    export module variablespeeds {
        class NodeImpl {
            public leader: boolean = false;

            public toL: Sender<number>;
            public frR: Receiver<number>;

            constructor(public world: WorldImpl<NodeImpl>,
                        public uid: number) {
                world.nodes.push(this);
            }

            setup() {
            }

            update() {
            }
        }

        export var New = (n: number) => {
            var world = new WorldImpl<NodeImpl>(),
                nodes = MakeUids(n).map((uid: number) => {
                    return new NodeImpl(world, uid + 2);
                });

            nodes.forEach((fr: NodeImpl, i: number) => {
                var to = nodes[(i + 1) % n];
                fr.toL = to.frR = new ChannelImpl<number>(world, fr, to);
            });

            return world;
        };
    }
}