/// <reference path="jquery.d.ts" />
/// <reference path="anim.ts" />
/// <reference path="models.ts" />
module app {
    interface Pt {
        x: number;
        y: number;
    }

    interface Sz {
        w: number;
        h: number;
    }

    interface Rect extends Pt, Sz { }

    interface Canvas extends CanvasRenderingContext2D {
    }

    interface NodeLoc extends Pt {
        uid: number;
        tx: number;
        ty: number;
    }

    /**
     *
     */
    class WorldView {
        static MODE_IDLE = 0;
        static MODE_SEND = 1;
        static MODE_RECV = 2;

        private locs: NodeLoc[] = [];
        private locsByUid: NodeLoc[] = [];

        // rendering modes
        private mode: number = WorldView.MODE_IDLE;
        private pct: number = 0.0;

        constructor(private title: string,
                    public world: models.World<models.Node>,
                    public canvas: Canvas,
                    public rect: Rect) {
        }

        /**
         *
         */
        public resize(rect: Rect) {
            var r = Math.min(rect.w, rect.h) / 2 - 60,
                tr = r - 25,
                nodes = this.world.nodes,
                dr = 2 * Math.PI / nodes.length,
                cx = rect.w / 2,
                cy = rect.h / 2,
                locs = this.locs,
                locsByUid = this.locsByUid;

            nodes.forEach((node: models.Node, i: number) => {
                var vx = Math.cos(i * dr),
                    vy = Math.sin(i * dr);
                var pt = {
                    uid: node.uid,
                    x: cx + r * vx,
                    y: cy + r * vy,
                    tx: cx + tr * vx,
                    ty: cy + tr * vy,
                };
                locs[i] = pt;
                locsByUid[node.uid] = pt;
            });
        }

        /**
         *
         */
        public draw() {
            var canvas = this.canvas,
                rect = this.rect;
            canvas.save();
            canvas.beginPath();
            canvas.moveTo(rect.x, rect.y);
            canvas.lineTo(rect.x + rect.w, rect.y);
            canvas.lineTo(rect.x + rect.w, rect.y + rect.h);
            canvas.lineTo(rect.x, rect.y + rect.h);
            canvas.closePath();
            canvas.clip();
            canvas.translate(rect.x, rect.y);
            this.render(canvas, rect);
            canvas.restore();
        }

        /**
         *
         */
        private render(canvas: Canvas, size: Sz) {
            var world = this.world,
                mode = this.mode,
                locs = this.locs,
                nodes = this.world.nodes,
                first = locs[0],
                n = locs.length,
                locsByUid = this.locsByUid,
                pct = this.pct;

            var nodesReceiving: boolean[] = [];
            world.sentMsgs.forEach((msg: models.SentMsg<any>) => {
                nodesReceiving[msg.dst.uid] = true;
            });

            canvas.clearRect(0, 0, size.w, size.h);

            // render origin lines
            if (mode == WorldView.MODE_SEND || mode == WorldView.MODE_RECV) {
                canvas.strokeStyle = '#999';
                canvas.setLineDash([2, 6]);

                world.sentMsgs.forEach((msg: models.SentMsg<any>) => {
                    var frPt = locsByUid[msg.src.uid],
                        toPt = locsByUid[msg.dst.uid],
                        spct = (mode == WorldView.MODE_RECV) ? 1.0 : pct,
                        x = frPt.x + (toPt.x - frPt.x) * spct,
                        y = frPt.y + (toPt.y - frPt.y) * spct,
                        orPt = locsByUid[msg.origin.uid];
                    canvas.beginPath();
                    canvas.moveTo(x, y);
                    canvas.lineTo(orPt.x, orPt.y);
                    canvas.stroke();
                });

                world.heldMsgs.forEach((msg: models.HeldMsg<any>) => {
                    var atPt = locsByUid[msg.at.uid],
                        orPt = locsByUid[msg.origin.uid];
                    canvas.beginPath();
                    canvas.moveTo(atPt.x, atPt.y);
                    canvas.lineTo(orPt.x, orPt.y);
                    canvas.stroke();
                });

                canvas.setLineDash([]);
            }

            // render edges
            canvas.strokeStyle = '#eee';
            canvas.lineWidth = 2;
            canvas.beginPath();
            canvas.moveTo(first.x, first.y);
            for (var i = 1; i < n; i++) {
                canvas.lineTo(locs[i].x, locs[i].y);
            }
            canvas.closePath();
            canvas.stroke();

            // render messages
            if (mode == WorldView.MODE_SEND) {
                world.sentMsgs.forEach((msg: models.SentMsg<any>) => {
                    var frPt = locsByUid[msg.src.uid],
                        toPt = locsByUid[msg.dst.uid],
                        x = frPt.x + (toPt.x - frPt.x) * pct,
                        y = frPt.y + (toPt.y - frPt.y) * pct,
                        origin = locsByUid[msg.origin.uid];

                    canvas.fillStyle = '#999';
                    canvas.strokeStyle = '#777';
                    canvas.beginPath();
                    canvas.arc(x, y, 6, 0, 2 * Math.PI, false);
                    canvas.fill();
                    canvas.stroke();
                });
            }

            var rect = this.rect,
                cx = rect.w / 2,
                cy = rect.y / 2;

            // render nodes
            canvas.strokeStyle = '#666';
            locs.forEach((loc: NodeLoc, i: number) => {
                var leader = world.leader ? locsByUid[world.leader.uid] : null,
                    r = (mode == WorldView.MODE_RECV && nodesReceiving[nodes[i].uid])
                    ? 10 + 1.5 * (1 + Math.cos((2 * pct - 1) * Math.PI))
                    : 10;
                canvas.fillStyle = (leader == loc) ? '#f90' : '#09f';
                canvas.beginPath();
                canvas.arc(loc.x, loc.y, r, 0, 2*Math.PI, false);
                canvas.fill();
                canvas.stroke();

                var txt = '' + loc.uid,
                    met = canvas.measureText(txt);
                canvas.font = '14px Helvetica';
                canvas.fillStyle = '#999';
                canvas.fillText(txt, loc.tx - met.width/2, loc.ty);
            });

            // render title
            var title = this.title,
                tw = canvas.measureText(title).width;
            canvas.font = '14px Helvetica';
            canvas.fillStyle = '#999';
            canvas.fillText(
                this.title,
                rect.w/2 - tw/2,
                rect.h - 15);
        }

        /**
         * Enter the sending mdoe of the animation where we show messages
         * traversing links to their target nodes.
         */
        private startSendingMessages() {
            this.mode = WorldView.MODE_SEND;
            anim.transition((pct: number) => {
                this.pct = pct;
                this.draw();
            }, 1000).whenDone(() => {
                this.startReceivingMessages();
            });
        }

        /**
         * Enter the receiving mode of the animation where nodes "absorb"
         * their arriving nodes.
         */
        private startReceivingMessages() {
            this.mode = WorldView.MODE_RECV;
            anim.transition((pct: number) => {
                this.pct = pct;
                this.draw();
            }, 300).whenDone(() => {
                this.start();
            });
        }

        /**
         * Begin a cycle of the animation loop.
         */
        start() {
            var world = this.world;

            this.mode = WorldView.MODE_IDLE;

            world.update();

            if (world.hasHalted()) {
                this.draw();
                return;
            }

            this.startSendingMessages();
        }
    }

    var $e = (name: string) => {
        return $(document.createElement(name));
    };

    var CreateCanvas = (root : JQuery) : Canvas => {
        var ww = window.innerWidth,
            wh = window.innerHeight,
            sz = Math.min(ww, wh);
        var canvas = <HTMLCanvasElement>$e('canvas').addClass('canvas')
            .attr('width', sz)
            .attr('height', sz)
            .css('left', (ww - sz) / 2)
            .css('top', (wh - sz) / 2)
            .appendTo(root).get(0);
        return <CanvasRenderingContext2D>canvas.getContext('2d');
    };

    var Main = () => {
        var body = $(document.body),
            canvas = CreateCanvas(body),
            w = canvas.canvas.width,
            h = canvas.canvas.height;

        var views = [
            new WorldView(
                "Le Lann, Chang, and Roberts",
                models.lcr.New(10),
                canvas,
                {x: 0, y: 0, w: w/2, h: h/2}),

            new WorldView(
                "Hirschberg and Sinclair",
                models.hs.New(10),
                canvas,
                {x: w/2, y: 0, w: w/2, h: h/2}),

            new WorldView(
                "Time Slice",
                models.timeslice.New(10),
                canvas,
                {x: 0, y: h/2, w: w/2, h: h/2}),

            new WorldView(
                "Variable Speeds",
                models.variablespeeds.New(10),
                canvas,
                {x: w/2, y: h/2, w: w/2, h: h/2}),
        ];

        views.forEach((w: WorldView) => {
            w.resize(w.rect);
            w.draw();
            w.start();
        });
    };

    Main();
}