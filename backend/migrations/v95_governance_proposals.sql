CREATE TABLE IF NOT EXISTS governance_proposals (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'discussion', -- discussion, voting, passed, rejected
    category VARCHAR(50) NOT NULL,
    votes_for INTEGER DEFAULT 0,
    votes_against INTEGER DEFAULT 0,
    votes_total INTEGER DEFAULT 0,
    quorum_needed INTEGER DEFAULT 2000,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMP NOT NULL,
    proposer VARCHAR(255) NOT NULL
);
