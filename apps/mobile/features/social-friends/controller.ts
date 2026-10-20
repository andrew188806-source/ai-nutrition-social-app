import type { SocialFriendsRepository, FriendRequest, FriendResult } from "./repository";

export type FriendRequestDeadline = Readonly<{
    schedule(callback: () => void, milliseconds: number): () => void;
}>;
const defaultDeadline: FriendRequestDeadline = {
    schedule(callback, milliseconds) {
        const timer = setTimeout(callback, milliseconds);
        return () => clearTimeout(timer);
    }
};

export class SocialFriendsController {
    private epoch = 0;
    private pending = false;
    private cancel: (() => void) | null = null;
    constructor(private repository: Pick<SocialFriendsRepository, "execute"> | null, private deadline = defaultDeadline) {}
    isBusy() { return this.pending; }
    invalidate() { this.epoch++; this.cancel?.(); }
    async execute(actor: string, request: FriendRequest): Promise<FriendResult | null> {
        // Synchronous single-flight: a second tap cannot dispatch before React has rendered busy.
        if (this.pending) return null;
        if (!this.repository) throw Error("operation_not_enabled");
        const repository = this.repository, epoch = ++this.epoch;
        this.pending = true;
        return new Promise((resolve, reject) => {
            let settled = false, stop: (() => void) | undefined;
            const finish = (value: FriendResult | null, error?: unknown) => {
                if (settled) return;
                settled = true;
                stop?.();
                this.pending = false;
                this.cancel = null;
                if (epoch !== this.epoch) resolve(null);
                else if (error) reject(error);
                else resolve(value);
            };
            this.cancel = () => finish(null);
            // Same 15s bound as the existing SDK invoke, now also covering session acquisition.
            stop = this.deadline.schedule(() => finish(null, Error("request_timeout")), 15000);
            if (!settled) void repository.execute(actor, request).then(value => finish(value), error => finish(null, error));
        });
    }
}