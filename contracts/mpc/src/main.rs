use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Arc;
use threshold_crypto::{SecretKeySet, SecretKeyShare, PublicKeySet, SignatureShare};
use warp::Filter;

#[derive(Clone)]
struct MpcState {
    pub id: usize,
    pub sk_share: SecretKeyShare,
    pub pk_set: PublicKeySet,
}

#[derive(Deserialize)]
struct SignRequest {
    message_hex: String,
}

#[derive(Serialize)]
struct SignResponse {
    node_id: usize,
    signature_share_hex: String,
}

#[tokio::main]
async fn main() {
    println!("GSTD Sovereign Bridge - MPC Threshold Node Status: [ONLINE]");
    
    // In a production environment, DKG (Distributed Key Generation) would form the SecretKeySet
    // Here we simulate a trusted dealer initializing the set for 3-of-4 thresholds.
    let mut rng = OsRng;
    let threshold = 2; // 3-of-4
    let sk_set = SecretKeySet::random(threshold, &mut rng);
    let pk_set = sk_set.public_keys();

    // Node ID from args or default to 1
    let node_id: usize = env::var("NODE_ID").unwrap_or_else(|_| "1".to_string()).parse().unwrap_or(1);
    let sk_share = sk_set.secret_key_share(node_id);

    let state = Arc::new(MpcState {
        id: node_id,
        sk_share,
        pk_set,
    });

    let state_filter = warp::any().map(move || state.clone());

    let sign_route = warp::post()
        .and(warp::path("sign"))
        .and(warp::body::json())
        .and(state_filter.clone())
        .map(|req: SignRequest, state: Arc<MpcState>| {
            let msg = hex::decode(&req.message_hex).unwrap_or_default();
            let sig_share = state.sk_share.sign(&msg);
            
            let resp = SignResponse {
                node_id: state.id,
                signature_share_hex: hex::encode(sig_share.to_bytes()),
            };
            
            warp::reply::json(&resp)
        });

    let pk_route = warp::get()
        .and(warp::path("public_key"))
        .and(state_filter.clone())
        .map(|state: Arc<MpcState>| {
            warp::reply::json(&hex::encode(state.pk_set.public_key().to_bytes()))
        });

    let routes = sign_route.or(pk_route);

    let port: u16 = env::var("PORT").unwrap_or_else(|_| "3030".to_string()).parse().unwrap_or(3030);
    println!("MPC Node {} listening on 0.0.0.0:{}", node_id, port);
    
    warp::serve(routes).run(([0, 0, 0, 0], port)).await;
}
