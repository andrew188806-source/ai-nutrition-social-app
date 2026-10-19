import { SocialFriendsRepository, type FriendRequest, type FriendResult } from "./repository";
export class SocialFriendsController {
    private epoch = 0;
    constructor(private repository: SocialFriendsRepository | null) { }
    invalidate() { this.epoch++; }
    async execute(actor: string, request: FriendRequest): Promise<FriendResult | null> {
        const epoch = ++this.epoch;
        if (!this.repository)
            throw Error("operation_not_enabled");
        try {
            const result = await this.repository.execute(actor, request);
            return epoch === this.epoch ? result : null;
        }
        catch (e) {
            if (epoch !== this.epoch)
                return null;
            throw e;
        }
    }
}
