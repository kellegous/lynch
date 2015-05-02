module anim {

    var linear = (p: number) => {
        return p;
    };

    class Tx {
        done: () => void;
        easing: (p: number) => number;

        whenDone(f: () => void): Tx {
            this.done = f;
            return this;
        }

        withEasing(f: (p: number) => number) : Tx {
            this.easing = f;
            return this;
        }
    }

    export interface Transition {
        whenDone(f: () => void): Transition;
        withEasing(f: (p: number) => number): Transition;
    }

    /**
     * A driver for transition style animations. This triggers callbacks at frame-rate
     * granularity with an adjusted progress parameter.
     *
     * @param callback the callback function for each update.
     * @param duration the full duration of the transition in milliseconds.
     * @return a transition object offering more options.
     */
    export var transition = (callback: (p: number) => void, duration: number) : Transition => {
        var tx = new Tx,
            t0 = Date.now(),
            tick = () => {
                var t1 = Date.now(),
                    easing = tx.easing || linear,
                    p = Math.min(1.0, (t1 - t0) / duration);
                callback(easing(p));
                if (p < 1.0) {
                    requestAnimationFrame(tick);
                } else if (tx.done) {
                    tx.done();
                }
            };
        requestAnimationFrame(tick);
        return tx;
    };
}