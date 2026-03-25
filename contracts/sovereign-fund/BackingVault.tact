import "@stdlib/deploy";
import "@stdlib/ownable";

contract BackingVault with Deployable, Ownable {
    owner: Address;
    totalBacking: Int as coins;

    init(owner: Address) {
        self.owner = owner;
        self.totalBacking = 0;
    }


    receive(msg: Deposit) {
        let ctx: Context = context();
        self.totalBacking += ctx.value;
    }

    // Explicitly NO withdrawal logic in BackingVault.
    // 50% locked forever.

    get fun backing_balance(): Int {
        return self.totalBacking;
    }
}

message(0x4a25ce37) Deposit {}
