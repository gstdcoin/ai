--
-- PostgreSQL database dump
--

\restrict YOW1a90M7VUR1b4MV6LmGDZshtIE17j6ZHk2e9ZycQGbKVkymEuKpDTbaIECyNk

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: generate_referral_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_referral_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := substring(md5(random()::text) from 1 for 8);
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_referral_code() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: devices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.devices (
    device_id character varying(255) NOT NULL,
    wallet_address character varying(100) NOT NULL,
    device_type character varying(20) NOT NULL,
    reputation numeric(5,4) DEFAULT 0.5 NOT NULL,
    total_tasks integer DEFAULT 0 NOT NULL,
    successful_tasks integer DEFAULT 0 NOT NULL,
    failed_tasks integer DEFAULT 0 NOT NULL,
    total_energy_consumed integer DEFAULT 0 NOT NULL,
    average_response_time_ms integer DEFAULT 0 NOT NULL,
    cached_models text[],
    last_seen_at timestamp without time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    slashing_count integer DEFAULT 0 NOT NULL,
    trust_score numeric(5,4) DEFAULT 0.1,
    region character varying(10) DEFAULT 'unknown'::character varying,
    latency_fingerprint integer DEFAULT 0,
    accuracy_score numeric(5,4) DEFAULT 0.5,
    latency_score numeric(5,4) DEFAULT 0.5,
    stability_score numeric(5,4) DEFAULT 0.5,
    last_reputation_update timestamp without time zone,
    cpu_score integer DEFAULT 0,
    ram_gb numeric(5,2) DEFAULT 0,
    orchestration_score numeric(10,4) DEFAULT 0
);


ALTER TABLE public.devices OWNER TO postgres;

--
-- Name: TABLE devices; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.devices IS 'Registered computing devices (workers)';


--
-- Name: COLUMN devices.device_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.devices.device_id IS 'Unique device fingerprint/identifier';


--
-- Name: COLUMN devices.wallet_address; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.devices.wallet_address IS 'Wallet address associated with device (multiple devices per wallet allowed)';


--
-- Name: COLUMN devices.reputation; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.devices.reputation IS 'Device reputation score (0.0 to 1.0)';


--
-- Name: COLUMN devices.last_seen_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.devices.last_seen_at IS 'Last time device was seen/active';


--
-- Name: COLUMN devices.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.devices.is_active IS 'Whether device is currently active';


--
-- Name: COLUMN devices.trust_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.devices.trust_score IS 'Device trust score for enterprise features (0.0 to 1.0)';


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.error_logs (
    id integer NOT NULL,
    error_type character varying(50) NOT NULL,
    error_message text NOT NULL,
    stack_trace text,
    context jsonb,
    severity character varying(20) DEFAULT 'error'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.error_logs OWNER TO postgres;

--
-- Name: error_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.error_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.error_logs_id_seq OWNER TO postgres;

--
-- Name: error_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.error_logs_id_seq OWNED BY public.error_logs.id;


--
-- Name: failed_payouts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.failed_payouts (
    id integer NOT NULL,
    task_id character varying(255),
    payout_type character varying(20) NOT NULL,
    recipient_address character varying(255),
    amount_gstd numeric(18,9) NOT NULL,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    max_retries integer DEFAULT 5 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_retry_at timestamp without time zone
);


ALTER TABLE public.failed_payouts OWNER TO postgres;

--
-- Name: failed_payouts_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.failed_payouts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.failed_payouts_id_seq OWNER TO postgres;

--
-- Name: failed_payouts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.failed_payouts_id_seq OWNED BY public.failed_payouts.id;


--
-- Name: fund_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fund_transactions (
    id integer NOT NULL,
    fund_type character varying(30) NOT NULL,
    amount_gstd numeric(18,9) NOT NULL,
    tx_type character varying(20) NOT NULL,
    source_task_id character varying(255),
    description text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fund_transactions OWNER TO postgres;

--
-- Name: fund_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.fund_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.fund_transactions_id_seq OWNER TO postgres;

--
-- Name: fund_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.fund_transactions_id_seq OWNED BY public.fund_transactions.id;


--
-- Name: golden_reserve_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.golden_reserve_log (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    gstd_amount numeric(18,9) NOT NULL,
    xaut_amount numeric(18,9),
    treasury_wallet character varying(128) NOT NULL,
    swap_tx_hash character varying(64),
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.golden_reserve_log OWNER TO postgres;

--
-- Name: TABLE golden_reserve_log; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.golden_reserve_log IS 'Log of GSTD to XAUt swaps for golden reserve';


--
-- Name: golden_reserve_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.golden_reserve_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.golden_reserve_log_id_seq OWNER TO postgres;

--
-- Name: golden_reserve_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.golden_reserve_log_id_seq OWNED BY public.golden_reserve_log.id;


--
-- Name: moving_entropy_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.moving_entropy_stats (
    operation_id character varying(50) NOT NULL,
    recent_errors_json jsonb DEFAULT '[]'::jsonb,
    current_temp numeric(10,6) DEFAULT 0.1
);


ALTER TABLE public.moving_entropy_stats OWNER TO postgres;

--
-- Name: network_health; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.network_health (
    id integer NOT NULL,
    avg_latency_ms integer,
    global_entropy numeric(5,4),
    active_nodes integer,
    recorded_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.network_health OWNER TO postgres;

--
-- Name: network_health_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.network_health_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.network_health_id_seq OWNER TO postgres;

--
-- Name: network_health_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.network_health_id_seq OWNED BY public.network_health.id;


--
-- Name: network_measurements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.network_measurements (
    id integer NOT NULL,
    node_id character varying(255) NOT NULL,
    latency_ms integer,
    packet_loss double precision,
    connection_type character varying(50),
    gps_lat double precision,
    gps_lng double precision,
    recorded_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.network_measurements OWNER TO postgres;

--
-- Name: TABLE network_measurements; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.network_measurements IS 'Network telemetry data from GENESIS_MAP task';


--
-- Name: network_measurements_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.network_measurements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.network_measurements_id_seq OWNER TO postgres;

--
-- Name: network_measurements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.network_measurements_id_seq OWNED BY public.network_measurements.id;


--
-- Name: network_physics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.network_physics (
    id integer NOT NULL,
    temperature numeric(10,6),
    pressure numeric(10,6),
    entropy_gradient numeric(10,6),
    recorded_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.network_physics OWNER TO postgres;

--
-- Name: network_physics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.network_physics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.network_physics_id_seq OWNER TO postgres;

--
-- Name: network_physics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.network_physics_id_seq OWNED BY public.network_physics.id;


--
-- Name: nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.nodes (
    id character varying(255) NOT NULL,
    wallet_address character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    status character varying(20) DEFAULT 'offline'::character varying NOT NULL,
    cpu_model character varying(255),
    ram_gb integer,
    last_seen timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    trust_score double precision DEFAULT 1.0 NOT NULL,
    country character varying(2),
    latitude double precision,
    longitude double precision,
    is_spoofing boolean DEFAULT false NOT NULL,
    eco_certified boolean DEFAULT false NOT NULL,
    current_hashrate double precision DEFAULT 0
);


ALTER TABLE public.nodes OWNER TO postgres;

--
-- Name: TABLE nodes; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.nodes IS 'Registered computing nodes (devices)';


--
-- Name: COLUMN nodes.trust_score; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.nodes.trust_score IS 'Reputation score (0.0-1.0). Default 1.0. Decreases on validation failures.';


--
-- Name: COLUMN nodes.country; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.nodes.country IS 'ISO 3166-1 alpha-2 country code determined by IP geolocation.';


--
-- Name: COLUMN nodes.latitude; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.nodes.latitude IS 'Last reported GPS latitude.';


--
-- Name: COLUMN nodes.longitude; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.nodes.longitude IS 'Last reported GPS longitude.';


--
-- Name: COLUMN nodes.is_spoofing; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.nodes.is_spoofing IS 'Flag indicating if GPS spoofing was detected (speed > 1000 km/h).';


--
-- Name: COLUMN nodes.eco_certified; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.nodes.eco_certified IS 'True if node uses renewable energy or idle hardware (Consumer DePIN).';


--
-- Name: operation_entropy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.operation_entropy (
    operation_id character varying(50) NOT NULL,
    total_executions bigint DEFAULT 0,
    collision_count bigint DEFAULT 0,
    entropy_score numeric(5,4) DEFAULT 0.1,
    last_updated timestamp without time zone DEFAULT now(),
    min_allowed_redundancy numeric(3,2) DEFAULT 1.05
);


ALTER TABLE public.operation_entropy OWNER TO postgres;

--
-- Name: payout_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payout_history (
    id integer NOT NULL,
    payout_transaction_id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    executor_address character varying(255) NOT NULL,
    tx_hash character varying(255) NOT NULL,
    query_id bigint,
    executor_reward_ton numeric(20,9) NOT NULL,
    platform_fee_ton numeric(20,9) NOT NULL,
    nonce bigint NOT NULL,
    confirmed_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payout_history OWNER TO postgres;

--
-- Name: TABLE payout_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.payout_history IS 'Log of all successful payout transactions for audit and analytics';


--
-- Name: COLUMN payout_history.payout_transaction_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.payout_history.payout_transaction_id IS 'Reference to payout_transactions table';


--
-- Name: COLUMN payout_history.confirmed_at; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.payout_history.confirmed_at IS 'When the transaction was confirmed on blockchain';


--
-- Name: payout_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payout_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payout_history_id_seq OWNER TO postgres;

--
-- Name: payout_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payout_history_id_seq OWNED BY public.payout_history.id;


--
-- Name: payout_intents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payout_intents (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    executor_address character varying(255) NOT NULL,
    idempotency_key character varying(255) NOT NULL,
    nonce bigint NOT NULL,
    query_id bigint,
    executor_reward_gstd numeric(20,9) NOT NULL,
    platform_fee_gstd numeric(20,9) NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    used boolean DEFAULT false NOT NULL,
    used_at timestamp without time zone
);


ALTER TABLE public.payout_intents OWNER TO postgres;

--
-- Name: payout_intents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payout_intents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payout_intents_id_seq OWNER TO postgres;

--
-- Name: payout_intents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payout_intents_id_seq OWNED BY public.payout_intents.id;


--
-- Name: payout_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payout_transactions (
    id integer NOT NULL,
    task_id character varying(255),
    wallet_address character varying(255) NOT NULL,
    amount_ton numeric(20,9) NOT NULL,
    tx_hash character varying(255),
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    processed_at timestamp without time zone,
    error_message text,
    executor_address text,
    executor_reward_gstd numeric(20,9) DEFAULT 0,
    platform_fee_gstd numeric(20,9) DEFAULT 0
);


ALTER TABLE public.payout_transactions OWNER TO postgres;

--
-- Name: COLUMN payout_transactions.executor_reward_gstd; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.payout_transactions.executor_reward_gstd IS 'Amount paid to executor in GSTD';


--
-- Name: payout_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payout_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payout_transactions_id_seq OWNER TO postgres;

--
-- Name: payout_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payout_transactions_id_seq OWNED BY public.payout_transactions.id;


--
-- Name: pending_referrals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pending_referrals (
    telegram_id bigint NOT NULL,
    referral_code character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.pending_referrals OWNER TO postgres;

--
-- Name: platform_funds; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_funds (
    id integer NOT NULL,
    fund_type character varying(30) NOT NULL,
    balance_gstd numeric(18,9) DEFAULT 0,
    total_received_gstd numeric(18,9) DEFAULT 0,
    total_withdrawn_gstd numeric(18,9) DEFAULT 0,
    last_deposit_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.platform_funds OWNER TO postgres;

--
-- Name: TABLE platform_funds; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.platform_funds IS 'Platform treasury: dev fund (2%) and gold reserve (3%)';


--
-- Name: platform_funds_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.platform_funds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.platform_funds_id_seq OWNER TO postgres;

--
-- Name: platform_funds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.platform_funds_id_seq OWNED BY public.platform_funds.id;


--
-- Name: pow_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pow_audit_log (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    worker_wallet character varying(128) NOT NULL,
    attempt_nonce character varying(64),
    result_hash character varying(64),
    leading_zeros integer,
    difficulty_required integer,
    success boolean NOT NULL,
    failure_reason text,
    compute_time_ms integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pow_audit_log OWNER TO postgres;

--
-- Name: TABLE pow_audit_log; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.pow_audit_log IS 'Audit log of all PoW verification attempts';


--
-- Name: pow_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pow_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.pow_audit_log_id_seq OWNER TO postgres;

--
-- Name: pow_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pow_audit_log_id_seq OWNED BY public.pow_audit_log.id;


--
-- Name: pow_challenges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pow_challenges (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    worker_wallet character varying(128) NOT NULL,
    challenge character varying(64) NOT NULL,
    difficulty integer DEFAULT 16 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    verified boolean DEFAULT false,
    verified_at timestamp without time zone,
    nonce character varying(64),
    result_hash character varying(64)
);


ALTER TABLE public.pow_challenges OWNER TO postgres;

--
-- Name: TABLE pow_challenges; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.pow_challenges IS 'Proof-of-Work challenges for spam prevention';


--
-- Name: COLUMN pow_challenges.difficulty; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pow_challenges.difficulty IS 'Number of leading zero bits required in SHA256 hash';


--
-- Name: pow_challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pow_challenges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.pow_challenges_id_seq OWNER TO postgres;

--
-- Name: pow_challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pow_challenges_id_seq OWNED BY public.pow_challenges.id;


--
-- Name: pow_statistics; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.pow_statistics AS
 SELECT date_trunc('hour'::text, pow_challenges.created_at) AS hour,
    count(*) AS total_challenges,
    count(*) FILTER (WHERE (pow_challenges.verified = true)) AS verified_count,
    round(avg(pow_challenges.difficulty), 1) AS avg_difficulty,
    count(DISTINCT pow_challenges.worker_wallet) AS unique_workers
   FROM public.pow_challenges
  WHERE (pow_challenges.created_at > (now() - '24:00:00'::interval))
  GROUP BY (date_trunc('hour'::text, pow_challenges.created_at))
  ORDER BY (date_trunc('hour'::text, pow_challenges.created_at)) DESC;


ALTER TABLE public.pow_statistics OWNER TO postgres;

--
-- Name: processed_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.processed_payments (
    id integer NOT NULL,
    tx_hash character varying(64) NOT NULL,
    task_id character varying(255),
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.processed_payments OWNER TO postgres;

--
-- Name: processed_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.processed_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.processed_payments_id_seq OWNER TO postgres;

--
-- Name: processed_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.processed_payments_id_seq OWNED BY public.processed_payments.id;


--
-- Name: referral_rewards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.referral_rewards (
    id integer NOT NULL,
    referrer_address character varying(100),
    referred_user_address character varying(100),
    task_id character varying(64),
    amount_gstd numeric(20,9) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone
);


ALTER TABLE public.referral_rewards OWNER TO postgres;

--
-- Name: referral_rewards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.referral_rewards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.referral_rewards_id_seq OWNER TO postgres;

--
-- Name: referral_rewards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.referral_rewards_id_seq OWNED BY public.referral_rewards.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    applied_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO postgres;

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.schema_migrations_id_seq OWNER TO postgres;

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: task_escrow; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.task_escrow (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    creator_wallet character varying(128) NOT NULL,
    budget_gstd numeric(18,9) NOT NULL,
    platform_fee_gstd numeric(18,9) NOT NULL,
    total_locked_gstd numeric(18,9) NOT NULL,
    difficulty character varying(20) DEFAULT 'medium'::character varying,
    task_type character varying(50) NOT NULL,
    geography jsonb DEFAULT '{"type": "global"}'::jsonb,
    status character varying(20) DEFAULT 'locked'::character varying,
    locked_at timestamp without time zone DEFAULT now() NOT NULL,
    released_at timestamp without time zone,
    workers_paid integer DEFAULT 0,
    total_paid_gstd numeric(18,9) DEFAULT 0
);


ALTER TABLE public.task_escrow OWNER TO postgres;

--
-- Name: TABLE task_escrow; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.task_escrow IS 'Holds locked funds for tasks until completion';


--
-- Name: task_escrow_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.task_escrow_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.task_escrow_id_seq OWNER TO postgres;

--
-- Name: task_escrow_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.task_escrow_id_seq OWNED BY public.task_escrow.id;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tasks (
    task_id character varying(255) NOT NULL,
    requester_address character varying(255) NOT NULL,
    task_type character varying(100) NOT NULL,
    operation character varying(100),
    model character varying(255),
    labor_compensation_gstd numeric(20,9) DEFAULT 0,
    priority_score numeric(10,6) DEFAULT 0,
    status character varying(50) DEFAULT 'pending'::character varying,
    escrow_status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    min_trust_score numeric(5,2) DEFAULT 0,
    is_private boolean DEFAULT false,
    confidence_depth integer DEFAULT 1,
    redundancy_factor integer DEFAULT 1,
    is_spot_check boolean DEFAULT false,
    payload text,
    executor_address character varying(255),
    result text,
    result_hash character varying(255),
    validated_at timestamp without time zone,
    payment_verified_at timestamp without time zone,
    payment_memo character varying(255),
    platform_fee_ton numeric(20,9) DEFAULT 0,
    executor_reward_ton numeric(20,9) DEFAULT 0,
    executor_payout_status character varying(50) DEFAULT 'pending'::character varying,
    executor_payout_tx_hash character varying(255),
    certainty_gravity_score numeric(10,6) DEFAULT 0,
    validation_hash character varying(255),
    arbitration_count integer DEFAULT 0,
    entropy_score numeric(10,6) DEFAULT 1.0,
    creator_wallet character varying(128),
    budget_gstd numeric(18,9),
    reward_gstd numeric(18,9),
    deposit_id character varying(255),
    difficulty character varying(20) DEFAULT 'medium'::character varying,
    geography jsonb DEFAULT '{"type": "global"}'::jsonb,
    escrow_id integer,
    max_workers integer DEFAULT 1,
    workers_completed integer DEFAULT 0,
    reward_per_worker numeric(18,9),
    estimated_time_sec integer DEFAULT 30,
    pow_required boolean DEFAULT true,
    pow_difficulty integer DEFAULT 16,
    priority integer DEFAULT 5,
    deadline timestamp with time zone,
    max_retries integer DEFAULT 3,
    retry_count integer DEFAULT 0,
    required_cpu integer DEFAULT 1,
    required_ram_gb integer DEFAULT 1,
    geo_restriction character varying(10)[],
    confidence_score numeric(5,4) DEFAULT 0.0,
    priority_tier character varying(10) DEFAULT 'standard'::character varying,
    min_reward_floor numeric(18,9) DEFAULT 0.0001,
    gravity_score numeric(18,9) DEFAULT 0.0,
    entropy_snapshot numeric(5,4) DEFAULT 0.0,
    required_certainty_level numeric(5,4) DEFAULT 0.95,
    computational_pressure_impact numeric(10,6) DEFAULT 0.0,
    assigned_device character varying(255),
    result_data text,
    result_nonce character varying(255),
    result_proof character varying(255),
    execution_time_ms integer,
    result_submitted_at timestamp without time zone,
    timeout_at timestamp without time zone,
    total_reward_pool numeric(18,9),
    completed_at timestamp without time zone,
    assigned_at timestamp without time zone,
    egress_used_bytes bigint DEFAULT 0,
    is_data_transfer_free boolean DEFAULT true,
    input_source text DEFAULT 'manual'::text,
    orchestration_score_required double precision DEFAULT 0,
    stake_amount_gstd double precision DEFAULT 0,
    input_hash text DEFAULT ''::text,
    platform_fee_gstd double precision DEFAULT 0,
    executor_reward_gstd double precision DEFAULT 0,
    constraints_time_limit_sec integer DEFAULT 3600,
    constraints_max_energy_mwh integer DEFAULT 100
);


ALTER TABLE public.tasks OWNER TO postgres;

--
-- Name: TABLE tasks; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.tasks IS 'Main tasks table for distributed computing platform';


--
-- Name: COLUMN tasks.labor_compensation_gstd; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.labor_compensation_gstd IS 'Reward amount in GSTD tokens';


--
-- Name: COLUMN tasks.executor_payout_status; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.executor_payout_status IS 'Status of executor payout: pending, confirmed, failed';


--
-- Name: COLUMN tasks.executor_payout_tx_hash; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.executor_payout_tx_hash IS 'Transaction hash of the GSTD transfer to executor';


--
-- Name: COLUMN tasks.arbitration_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.arbitration_count IS 'Number of arbitration attempts for this task (max 3)';


--
-- Name: COLUMN tasks.creator_wallet; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.creator_wallet IS 'Wallet address of the task creator (for payment flow)';


--
-- Name: COLUMN tasks.budget_gstd; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.budget_gstd IS 'Total budget in GSTD tokens for the task';


--
-- Name: COLUMN tasks.reward_gstd; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.reward_gstd IS 'Reward amount in GSTD for the worker (95% of budget)';


--
-- Name: COLUMN tasks.deposit_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.deposit_id IS 'Transaction hash of the payment deposit';


--
-- Name: COLUMN tasks.priority; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.priority IS 'Task priority: 1=critical, 5=normal, 10=low';


--
-- Name: COLUMN tasks.deadline; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.deadline IS 'Task deadline for priority calculation';


--
-- Name: COLUMN tasks.max_retries; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.max_retries IS 'Maximum retry attempts for failed task';


--
-- Name: COLUMN tasks.retry_count; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.retry_count IS 'Current retry count';


--
-- Name: COLUMN tasks.is_data_transfer_free; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.tasks.is_data_transfer_free IS 'Always TRUE. GSTD does not charge for egress traffic.';


--
-- Name: telemetry_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.telemetry_queue (
    id integer NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    processed_at timestamp without time zone,
    retry_count integer DEFAULT 0,
    last_error text,
    status character varying(20) DEFAULT 'pending'::character varying
);


ALTER TABLE public.telemetry_queue OWNER TO postgres;

--
-- Name: TABLE telemetry_queue; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.telemetry_queue IS 'Fallback queue for telemetry when PostgreSQL is unavailable';


--
-- Name: telemetry_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.telemetry_queue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.telemetry_queue_id_seq OWNER TO postgres;

--
-- Name: telemetry_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.telemetry_queue_id_seq OWNED BY public.telemetry_queue.id;


--
-- Name: telemetry_rate_limits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.telemetry_rate_limits (
    wallet_address character varying(128) NOT NULL,
    request_count integer DEFAULT 0,
    window_start timestamp without time zone DEFAULT now() NOT NULL,
    last_request timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.telemetry_rate_limits OWNER TO postgres;

--
-- Name: TABLE telemetry_rate_limits; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.telemetry_rate_limits IS 'Rate limiting tracking for telemetry submission endpoints';


--
-- Name: topology_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.topology_metrics (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    device_id character varying(255) NOT NULL,
    wallet_address character varying(128) NOT NULL,
    collected_at timestamp without time zone DEFAULT now() NOT NULL,
    client_timestamp timestamp without time zone,
    latitude numeric(10,7),
    longitude numeric(10,7),
    gps_accuracy numeric(10,2),
    altitude numeric(10,2),
    speed numeric(10,2),
    h3_index_r7 character varying(20),
    h3_index_r9 character varying(20),
    connection_type character varying(20),
    effective_type character varying(10),
    downlink_mbps numeric(10,2),
    rtt_ms integer,
    save_data boolean DEFAULT false,
    platform character varying(50),
    vendor character varying(100),
    cpu_cores integer,
    memory_gb numeric(5,2),
    user_agent text,
    is_validated boolean DEFAULT false,
    validation_score numeric(5,4)
);


ALTER TABLE public.topology_metrics OWNER TO postgres;

--
-- Name: TABLE topology_metrics; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.topology_metrics IS 'Stores 5G/GPS telemetry data from Genesis Task execution';


--
-- Name: COLUMN topology_metrics.h3_index_r7; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.topology_metrics.h3_index_r7 IS 'H3 hexagonal index at resolution 7 (~5km² hexagon) for regional queries';


--
-- Name: COLUMN topology_metrics.h3_index_r9; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.topology_metrics.h3_index_r9 IS 'H3 hexagonal index at resolution 9 (~0.1km² hexagon) for local queries';


--
-- Name: topology_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.topology_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.topology_metrics_id_seq OWNER TO postgres;

--
-- Name: topology_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.topology_metrics_id_seq OWNED BY public.topology_metrics.id;


--
-- Name: transaction_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transaction_history (
    id integer NOT NULL,
    tx_id character varying(64) NOT NULL,
    from_wallet character varying(128),
    to_wallet character varying(128) NOT NULL,
    amount_gstd numeric(18,9) NOT NULL,
    tx_type character varying(30) NOT NULL,
    task_id character varying(255),
    escrow_id integer,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp without time zone,
    status character varying(20) DEFAULT 'pending'::character varying
);


ALTER TABLE public.transaction_history OWNER TO postgres;

--
-- Name: TABLE transaction_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.transaction_history IS 'Complete audit trail of all GSTD movements';


--
-- Name: transaction_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transaction_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.transaction_history_id_seq OWNER TO postgres;

--
-- Name: transaction_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transaction_history_id_seq OWNED BY public.transaction_history.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    wallet_address character varying(100) NOT NULL,
    balance numeric(18,9) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    referral_code character varying(20),
    referred_by character varying(100),
    gstd_balance numeric(18,9) DEFAULT 0,
    gstd_escrow_balance numeric(18,9) DEFAULT 0,
    gstd_frozen numeric(18,9) DEFAULT 0
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: wallet_access_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.wallet_access_log (
    id integer NOT NULL,
    wallet_address character varying(66) NOT NULL,
    operation character varying(50) NOT NULL,
    success boolean NOT NULL,
    details text,
    accessed_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.wallet_access_log OWNER TO postgres;

--
-- Name: wallet_access_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.wallet_access_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.wallet_access_log_id_seq OWNER TO postgres;

--
-- Name: wallet_access_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.wallet_access_log_id_seq OWNED BY public.wallet_access_log.id;


--
-- Name: withdrawal_locks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.withdrawal_locks (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    worker_wallet character varying(128) NOT NULL,
    amount_gstd numeric(18,9) NOT NULL,
    status character varying(20) DEFAULT 'pending_approval'::character varying NOT NULL,
    approved_by character varying(128),
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    notes text
);


ALTER TABLE public.withdrawal_locks OWNER TO postgres;

--
-- Name: withdrawal_locks_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.withdrawal_locks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.withdrawal_locks_id_seq OWNER TO postgres;

--
-- Name: withdrawal_locks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.withdrawal_locks_id_seq OWNED BY public.withdrawal_locks.id;


--
-- Name: worker_load; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.worker_load (
    worker_wallet character varying(100) NOT NULL,
    current_tasks integer DEFAULT 0,
    max_capacity integer DEFAULT 5,
    cpu_cores integer DEFAULT 4,
    ram_gb integer DEFAULT 8,
    last_seen timestamp with time zone DEFAULT now(),
    geography character varying(100) DEFAULT 'global'::character varying,
    trust_score numeric(3,2) DEFAULT 0.50
);


ALTER TABLE public.worker_load OWNER TO postgres;

--
-- Name: TABLE worker_load; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.worker_load IS 'Real-time worker load tracking for task distribution';


--
-- Name: worker_ratings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.worker_ratings (
    id integer NOT NULL,
    worker_wallet character varying(128) NOT NULL,
    total_tasks_completed integer DEFAULT 0,
    total_tasks_failed integer DEFAULT 0,
    total_earnings_gstd numeric(18,9) DEFAULT 0,
    avg_execution_time_ms integer DEFAULT 0,
    avg_quality_score numeric(5,4) DEFAULT 0.5,
    reliability_score numeric(5,4) DEFAULT 0.5,
    cpu_cores integer,
    ram_gb numeric(5,2),
    connection_type character varying(20),
    last_known_country character varying(3),
    first_task_at timestamp without time zone,
    last_task_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now(),
    level character varying(20) DEFAULT 'Bronze'::character varying,
    xp integer DEFAULT 0
);


ALTER TABLE public.worker_ratings OWNER TO postgres;

--
-- Name: TABLE worker_ratings; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.worker_ratings IS 'Worker reputation and performance tracking';


--
-- Name: worker_ratings_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.worker_ratings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.worker_ratings_id_seq OWNER TO postgres;

--
-- Name: worker_ratings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.worker_ratings_id_seq OWNED BY public.worker_ratings.id;


--
-- Name: worker_task_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.worker_task_assignments (
    id integer NOT NULL,
    task_id character varying(255) NOT NULL,
    worker_wallet character varying(128) NOT NULL,
    device_id character varying(255),
    status character varying(20) DEFAULT 'assigned'::character varying,
    assigned_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    execution_time_ms integer,
    result_data jsonb,
    quality_score numeric(5,4),
    reward_gstd numeric(18,9),
    payout_tx_id character varying(64),
    paid_at timestamp without time zone,
    stake_amount_gstd numeric(18,9) DEFAULT 0
);


ALTER TABLE public.worker_task_assignments OWNER TO postgres;

--
-- Name: worker_task_assignments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.worker_task_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.worker_task_assignments_id_seq OWNER TO postgres;

--
-- Name: worker_task_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.worker_task_assignments_id_seq OWNED BY public.worker_task_assignments.id;


--
-- Name: error_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.error_logs ALTER COLUMN id SET DEFAULT nextval('public.error_logs_id_seq'::regclass);


--
-- Name: failed_payouts id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.failed_payouts ALTER COLUMN id SET DEFAULT nextval('public.failed_payouts_id_seq'::regclass);


--
-- Name: fund_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fund_transactions ALTER COLUMN id SET DEFAULT nextval('public.fund_transactions_id_seq'::regclass);


--
-- Name: golden_reserve_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.golden_reserve_log ALTER COLUMN id SET DEFAULT nextval('public.golden_reserve_log_id_seq'::regclass);


--
-- Name: network_health id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.network_health ALTER COLUMN id SET DEFAULT nextval('public.network_health_id_seq'::regclass);


--
-- Name: network_measurements id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.network_measurements ALTER COLUMN id SET DEFAULT nextval('public.network_measurements_id_seq'::regclass);


--
-- Name: network_physics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.network_physics ALTER COLUMN id SET DEFAULT nextval('public.network_physics_id_seq'::regclass);


--
-- Name: payout_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_history ALTER COLUMN id SET DEFAULT nextval('public.payout_history_id_seq'::regclass);


--
-- Name: payout_intents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_intents ALTER COLUMN id SET DEFAULT nextval('public.payout_intents_id_seq'::regclass);


--
-- Name: payout_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_transactions ALTER COLUMN id SET DEFAULT nextval('public.payout_transactions_id_seq'::regclass);


--
-- Name: platform_funds id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_funds ALTER COLUMN id SET DEFAULT nextval('public.platform_funds_id_seq'::regclass);


--
-- Name: pow_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pow_audit_log ALTER COLUMN id SET DEFAULT nextval('public.pow_audit_log_id_seq'::regclass);


--
-- Name: pow_challenges id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pow_challenges ALTER COLUMN id SET DEFAULT nextval('public.pow_challenges_id_seq'::regclass);


--
-- Name: processed_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processed_payments ALTER COLUMN id SET DEFAULT nextval('public.processed_payments_id_seq'::regclass);


--
-- Name: referral_rewards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_rewards ALTER COLUMN id SET DEFAULT nextval('public.referral_rewards_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);


--
-- Name: task_escrow id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_escrow ALTER COLUMN id SET DEFAULT nextval('public.task_escrow_id_seq'::regclass);


--
-- Name: telemetry_queue id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telemetry_queue ALTER COLUMN id SET DEFAULT nextval('public.telemetry_queue_id_seq'::regclass);


--
-- Name: topology_metrics id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.topology_metrics ALTER COLUMN id SET DEFAULT nextval('public.topology_metrics_id_seq'::regclass);


--
-- Name: transaction_history id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_history ALTER COLUMN id SET DEFAULT nextval('public.transaction_history_id_seq'::regclass);


--
-- Name: wallet_access_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_access_log ALTER COLUMN id SET DEFAULT nextval('public.wallet_access_log_id_seq'::regclass);


--
-- Name: withdrawal_locks id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawal_locks ALTER COLUMN id SET DEFAULT nextval('public.withdrawal_locks_id_seq'::regclass);


--
-- Name: worker_ratings id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_ratings ALTER COLUMN id SET DEFAULT nextval('public.worker_ratings_id_seq'::regclass);


--
-- Name: worker_task_assignments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_task_assignments ALTER COLUMN id SET DEFAULT nextval('public.worker_task_assignments_id_seq'::regclass);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: failed_payouts failed_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.failed_payouts
    ADD CONSTRAINT failed_payouts_pkey PRIMARY KEY (id);


--
-- Name: fund_transactions fund_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fund_transactions
    ADD CONSTRAINT fund_transactions_pkey PRIMARY KEY (id);


--
-- Name: golden_reserve_log golden_reserve_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.golden_reserve_log
    ADD CONSTRAINT golden_reserve_log_pkey PRIMARY KEY (id);


--
-- Name: moving_entropy_stats moving_entropy_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.moving_entropy_stats
    ADD CONSTRAINT moving_entropy_stats_pkey PRIMARY KEY (operation_id);


--
-- Name: network_health network_health_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.network_health
    ADD CONSTRAINT network_health_pkey PRIMARY KEY (id);


--
-- Name: network_measurements network_measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.network_measurements
    ADD CONSTRAINT network_measurements_pkey PRIMARY KEY (id);


--
-- Name: network_physics network_physics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.network_physics
    ADD CONSTRAINT network_physics_pkey PRIMARY KEY (id);


--
-- Name: nodes nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_pkey PRIMARY KEY (id);


--
-- Name: operation_entropy operation_entropy_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operation_entropy
    ADD CONSTRAINT operation_entropy_pkey PRIMARY KEY (operation_id);


--
-- Name: payout_history payout_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_history
    ADD CONSTRAINT payout_history_pkey PRIMARY KEY (id);


--
-- Name: payout_intents payout_intents_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_intents
    ADD CONSTRAINT payout_intents_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payout_intents payout_intents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_intents
    ADD CONSTRAINT payout_intents_pkey PRIMARY KEY (id);


--
-- Name: payout_intents payout_intents_task_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_intents
    ADD CONSTRAINT payout_intents_task_id_key UNIQUE (task_id);


--
-- Name: payout_transactions payout_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_transactions
    ADD CONSTRAINT payout_transactions_pkey PRIMARY KEY (id);


--
-- Name: pending_referrals pending_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pending_referrals
    ADD CONSTRAINT pending_referrals_pkey PRIMARY KEY (telegram_id);


--
-- Name: platform_funds platform_funds_fund_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_funds
    ADD CONSTRAINT platform_funds_fund_type_key UNIQUE (fund_type);


--
-- Name: platform_funds platform_funds_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_funds
    ADD CONSTRAINT platform_funds_pkey PRIMARY KEY (id);


--
-- Name: pow_audit_log pow_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pow_audit_log
    ADD CONSTRAINT pow_audit_log_pkey PRIMARY KEY (id);


--
-- Name: pow_challenges pow_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pow_challenges
    ADD CONSTRAINT pow_challenges_pkey PRIMARY KEY (id);


--
-- Name: pow_challenges pow_challenges_task_id_worker_wallet_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pow_challenges
    ADD CONSTRAINT pow_challenges_task_id_worker_wallet_key UNIQUE (task_id, worker_wallet);


--
-- Name: processed_payments processed_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processed_payments
    ADD CONSTRAINT processed_payments_pkey PRIMARY KEY (id);


--
-- Name: processed_payments processed_payments_tx_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.processed_payments
    ADD CONSTRAINT processed_payments_tx_hash_key UNIQUE (tx_hash);


--
-- Name: referral_rewards referral_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_name_key UNIQUE (name);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: task_escrow task_escrow_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_escrow
    ADD CONSTRAINT task_escrow_pkey PRIMARY KEY (id);


--
-- Name: task_escrow task_escrow_task_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_escrow
    ADD CONSTRAINT task_escrow_task_id_key UNIQUE (task_id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (task_id);


--
-- Name: telemetry_queue telemetry_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telemetry_queue
    ADD CONSTRAINT telemetry_queue_pkey PRIMARY KEY (id);


--
-- Name: telemetry_rate_limits telemetry_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.telemetry_rate_limits
    ADD CONSTRAINT telemetry_rate_limits_pkey PRIMARY KEY (wallet_address);


--
-- Name: topology_metrics topology_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.topology_metrics
    ADD CONSTRAINT topology_metrics_pkey PRIMARY KEY (id);


--
-- Name: transaction_history transaction_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT transaction_history_pkey PRIMARY KEY (id);


--
-- Name: transaction_history transaction_history_tx_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT transaction_history_tx_id_key UNIQUE (tx_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (wallet_address);


--
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- Name: wallet_access_log wallet_access_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.wallet_access_log
    ADD CONSTRAINT wallet_access_log_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_locks withdrawal_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawal_locks
    ADD CONSTRAINT withdrawal_locks_pkey PRIMARY KEY (id);


--
-- Name: withdrawal_locks withdrawal_locks_task_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.withdrawal_locks
    ADD CONSTRAINT withdrawal_locks_task_id_key UNIQUE (task_id);


--
-- Name: worker_load worker_load_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_load
    ADD CONSTRAINT worker_load_pkey PRIMARY KEY (worker_wallet);


--
-- Name: worker_ratings worker_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_ratings
    ADD CONSTRAINT worker_ratings_pkey PRIMARY KEY (id);


--
-- Name: worker_ratings worker_ratings_worker_wallet_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_ratings
    ADD CONSTRAINT worker_ratings_worker_wallet_key UNIQUE (worker_wallet);


--
-- Name: worker_task_assignments worker_task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_task_assignments
    ADD CONSTRAINT worker_task_assignments_pkey PRIMARY KEY (id);


--
-- Name: worker_task_assignments worker_task_assignments_task_id_worker_wallet_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_task_assignments
    ADD CONSTRAINT worker_task_assignments_task_id_worker_wallet_key UNIQUE (task_id, worker_wallet);


--
-- Name: idx_assignment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_status ON public.worker_task_assignments USING btree (status);


--
-- Name: idx_assignment_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_task ON public.worker_task_assignments USING btree (task_id);


--
-- Name: idx_assignment_worker; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_assignment_worker ON public.worker_task_assignments USING btree (worker_wallet);


--
-- Name: idx_device_orchestration; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_device_orchestration ON public.devices USING btree (orchestration_score DESC);


--
-- Name: idx_devices_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_active ON public.devices USING btree (is_active, reputation DESC);


--
-- Name: idx_devices_last_seen; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_last_seen ON public.devices USING btree (last_seen_at);


--
-- Name: idx_devices_reputation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_reputation ON public.devices USING btree (reputation DESC);


--
-- Name: idx_devices_reputation_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_reputation_active ON public.devices USING btree (reputation DESC, is_active) WHERE (is_active = true);


--
-- Name: idx_devices_trust_region; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_trust_region ON public.devices USING btree (trust_score DESC, region);


--
-- Name: idx_devices_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_vector ON public.devices USING btree (accuracy_score DESC, latency_score DESC, stability_score DESC);


--
-- Name: idx_devices_wallet_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_wallet_active ON public.devices USING btree (wallet_address, is_active);


--
-- Name: idx_devices_wallet_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_devices_wallet_address ON public.devices USING btree (wallet_address);


--
-- Name: idx_error_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_error_logs_created_at ON public.error_logs USING btree (created_at DESC);


--
-- Name: idx_error_logs_error_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_error_logs_error_type ON public.error_logs USING btree (error_type);


--
-- Name: idx_error_logs_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_error_logs_severity ON public.error_logs USING btree (severity);


--
-- Name: idx_escrow_creator; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_escrow_creator ON public.task_escrow USING btree (creator_wallet);


--
-- Name: idx_escrow_locked_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_escrow_locked_at ON public.task_escrow USING btree (locked_at DESC);


--
-- Name: idx_escrow_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_escrow_status ON public.task_escrow USING btree (status);


--
-- Name: idx_failed_payouts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_failed_payouts_status ON public.failed_payouts USING btree (status, retry_count);


--
-- Name: idx_failed_payouts_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_failed_payouts_task_id ON public.failed_payouts USING btree (task_id);


--
-- Name: idx_fund_tx_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fund_tx_type ON public.fund_transactions USING btree (fund_type, created_at DESC);


--
-- Name: idx_golden_reserve_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_golden_reserve_task_id ON public.golden_reserve_log USING btree (task_id);


--
-- Name: idx_golden_reserve_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_golden_reserve_timestamp ON public.golden_reserve_log USING btree ("timestamp" DESC);


--
-- Name: idx_golden_reserve_treasury; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_golden_reserve_treasury ON public.golden_reserve_log USING btree (treasury_wallet);


--
-- Name: idx_intent_idempotency; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_intent_idempotency ON public.payout_intents USING btree (idempotency_key);


--
-- Name: idx_intent_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_intent_task ON public.payout_intents USING btree (task_id);


--
-- Name: idx_network_measurements_node; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_network_measurements_node ON public.network_measurements USING btree (node_id);


--
-- Name: idx_network_measurements_recorded; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_network_measurements_recorded ON public.network_measurements USING btree (recorded_at DESC);


--
-- Name: idx_nodes_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_country ON public.nodes USING btree (country);


--
-- Name: idx_nodes_is_spoofing; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_is_spoofing ON public.nodes USING btree (is_spoofing);


--
-- Name: idx_nodes_last_seen; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_last_seen ON public.nodes USING btree (last_seen DESC);


--
-- Name: idx_nodes_lb_perf; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_lb_perf ON public.nodes USING btree (status, trust_score DESC) WHERE ((status)::text = 'online'::text);


--
-- Name: idx_nodes_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_status ON public.nodes USING btree (status);


--
-- Name: idx_nodes_trust_score; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_trust_score ON public.nodes USING btree (trust_score DESC);


--
-- Name: idx_nodes_wallet_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_nodes_wallet_address ON public.nodes USING btree (wallet_address);


--
-- Name: idx_operation_entropy; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_operation_entropy ON public.operation_entropy USING btree (entropy_score DESC);


--
-- Name: idx_payout_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_created ON public.payout_transactions USING btree (created_at);


--
-- Name: idx_payout_history_confirmed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_history_confirmed ON public.payout_history USING btree (confirmed_at DESC);


--
-- Name: idx_payout_history_executor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_history_executor ON public.payout_history USING btree (executor_address);


--
-- Name: idx_payout_history_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_history_task ON public.payout_history USING btree (task_id);


--
-- Name: idx_payout_history_transaction_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_history_transaction_id ON public.payout_history USING btree (payout_transaction_id);


--
-- Name: idx_payout_history_tx_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_history_tx_hash ON public.payout_history USING btree (tx_hash);


--
-- Name: idx_payout_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_status ON public.payout_transactions USING btree (status);


--
-- Name: idx_payout_transactions_executor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_transactions_executor ON public.payout_transactions USING btree (executor_address);


--
-- Name: idx_payout_transactions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_transactions_status ON public.payout_transactions USING btree (status);


--
-- Name: idx_payout_transactions_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_transactions_task ON public.payout_transactions USING btree (task_id);


--
-- Name: idx_payout_tx_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_tx_hash ON public.payout_transactions USING btree (tx_hash);


--
-- Name: idx_payout_tx_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_tx_status ON public.payout_transactions USING btree (status);


--
-- Name: idx_payout_tx_wallet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payout_tx_wallet ON public.payout_transactions USING btree (wallet_address);


--
-- Name: idx_pow_audit_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pow_audit_task ON public.pow_audit_log USING btree (task_id, created_at DESC);


--
-- Name: idx_pow_audit_worker; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pow_audit_worker ON public.pow_audit_log USING btree (worker_wallet, created_at DESC);


--
-- Name: idx_pow_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pow_expires ON public.pow_challenges USING btree (expires_at);


--
-- Name: idx_pow_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pow_task ON public.pow_challenges USING btree (task_id);


--
-- Name: idx_pow_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pow_verified ON public.pow_challenges USING btree (verified, created_at DESC);


--
-- Name: idx_pow_worker; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pow_worker ON public.pow_challenges USING btree (worker_wallet);


--
-- Name: idx_processed_payments_processed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_processed_payments_processed_at ON public.processed_payments USING btree (processed_at DESC);


--
-- Name: idx_processed_payments_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_processed_payments_task_id ON public.processed_payments USING btree (task_id);


--
-- Name: idx_processed_payments_tx_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_processed_payments_tx_hash ON public.processed_payments USING btree (tx_hash);


--
-- Name: idx_rate_limit_window; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_rate_limit_window ON public.telemetry_rate_limits USING btree (window_start);


--
-- Name: idx_referral_rewards_referrer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_referral_rewards_referrer ON public.referral_rewards USING btree (referrer_address);


--
-- Name: idx_tasks_arbitration_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_arbitration_count ON public.tasks USING btree (arbitration_count);


--
-- Name: idx_tasks_assigned_device; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_assigned_device ON public.tasks USING btree (assigned_device);


--
-- Name: idx_tasks_budget_gstd; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_budget_gstd ON public.tasks USING btree (budget_gstd DESC) WHERE (budget_gstd IS NOT NULL);


--
-- Name: idx_tasks_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_created_at ON public.tasks USING btree (created_at DESC);


--
-- Name: idx_tasks_creator_wallet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_creator_wallet ON public.tasks USING btree (creator_wallet) WHERE (creator_wallet IS NOT NULL);


--
-- Name: idx_tasks_deposit_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_deposit_id ON public.tasks USING btree (deposit_id) WHERE (deposit_id IS NOT NULL);


--
-- Name: idx_tasks_depth; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_depth ON public.tasks USING btree (status, confidence_depth);


--
-- Name: idx_tasks_escrow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_escrow ON public.tasks USING btree (escrow_status);


--
-- Name: idx_tasks_escrow_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_escrow_status ON public.tasks USING btree (escrow_status) WHERE (escrow_status IS NOT NULL);


--
-- Name: idx_tasks_executor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_executor ON public.tasks USING btree (executor_address);


--
-- Name: idx_tasks_executor_completed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_executor_completed ON public.tasks USING btree (executor_address, completed_at DESC) WHERE ((status)::text = 'completed'::text);


--
-- Name: idx_tasks_executor_payout_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_executor_payout_status ON public.tasks USING btree (executor_payout_status) WHERE (executor_payout_status IS NOT NULL);


--
-- Name: idx_tasks_executor_reward_ton; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_executor_reward_ton ON public.tasks USING btree (executor_reward_ton) WHERE (executor_reward_ton IS NOT NULL);


--
-- Name: idx_tasks_gravity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_gravity ON public.tasks USING btree (status, gravity_score DESC);


--
-- Name: idx_tasks_input_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_input_hash ON public.tasks USING btree (input_hash);


--
-- Name: idx_tasks_labor_compensation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_labor_compensation ON public.tasks USING btree (labor_compensation_gstd DESC);


--
-- Name: idx_tasks_marketplace_perf; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_marketplace_perf ON public.tasks USING btree (status, labor_compensation_gstd DESC) WHERE ((status)::text = 'available'::text);


--
-- Name: idx_tasks_payment_memo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_payment_memo ON public.tasks USING btree (payment_memo) WHERE (payment_memo IS NOT NULL);


--
-- Name: idx_tasks_payout_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_payout_status ON public.tasks USING btree (executor_payout_status);


--
-- Name: idx_tasks_physics; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_physics ON public.tasks USING btree (status, certainty_gravity_score DESC, labor_compensation_gstd DESC);


--
-- Name: idx_tasks_platform_fee_ton; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_platform_fee_ton ON public.tasks USING btree (platform_fee_ton) WHERE (platform_fee_ton IS NOT NULL);


--
-- Name: idx_tasks_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_priority ON public.tasks USING btree (priority_score DESC);


--
-- Name: idx_tasks_priority_bucket; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_priority_bucket ON public.tasks USING btree (status, priority_score DESC, min_trust_score);


--
-- Name: idx_tasks_priority_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_priority_created ON public.tasks USING btree (priority, created_at) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying])::text[]));


--
-- Name: idx_tasks_requester; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_requester ON public.tasks USING btree (requester_address);


--
-- Name: idx_tasks_requester_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_requester_status ON public.tasks USING btree (requester_address, status);


--
-- Name: idx_tasks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);


--
-- Name: idx_tasks_status_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status_created ON public.tasks USING btree (status, created_at DESC);


--
-- Name: idx_tasks_status_creator; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_status_creator ON public.tasks USING btree (status, creator_wallet);


--
-- Name: idx_tasks_timeout; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tasks_timeout ON public.tasks USING btree (status, timeout_at) WHERE ((status)::text = 'assigned'::text);


--
-- Name: idx_telemetry_queue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_telemetry_queue_status ON public.telemetry_queue USING btree (status, created_at) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_topology_collected_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_collected_at ON public.topology_metrics USING btree (collected_at DESC);


--
-- Name: idx_topology_connection; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_connection ON public.topology_metrics USING btree (connection_type, effective_type);


--
-- Name: idx_topology_device; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_device ON public.topology_metrics USING btree (device_id);


--
-- Name: idx_topology_geo_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_geo_time ON public.topology_metrics USING btree (h3_index_r7, collected_at DESC) WHERE (h3_index_r7 IS NOT NULL);


--
-- Name: idx_topology_h3_r7; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_h3_r7 ON public.topology_metrics USING btree (h3_index_r7) WHERE (h3_index_r7 IS NOT NULL);


--
-- Name: idx_topology_h3_r9; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_h3_r9 ON public.topology_metrics USING btree (h3_index_r9) WHERE (h3_index_r9 IS NOT NULL);


--
-- Name: idx_topology_task_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_task_id ON public.topology_metrics USING btree (task_id);


--
-- Name: idx_topology_validated; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_validated ON public.topology_metrics USING btree (is_validated, collected_at DESC);


--
-- Name: idx_topology_wallet; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_topology_wallet ON public.topology_metrics USING btree (wallet_address);


--
-- Name: idx_tx_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tx_created ON public.transaction_history USING btree (created_at DESC);


--
-- Name: idx_tx_from; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tx_from ON public.transaction_history USING btree (from_wallet);


--
-- Name: idx_tx_task; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tx_task ON public.transaction_history USING btree (task_id);


--
-- Name: idx_tx_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tx_to ON public.transaction_history USING btree (to_wallet);


--
-- Name: idx_tx_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tx_type ON public.transaction_history USING btree (tx_type);


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_created_at ON public.users USING btree (created_at DESC);


--
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_referral_code ON public.users USING btree (referral_code);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by);


--
-- Name: idx_users_wallet_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_wallet_address ON public.users USING btree (wallet_address);


--
-- Name: idx_wallet_access_log_accessed_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wallet_access_log_accessed_at ON public.wallet_access_log USING btree (accessed_at);


--
-- Name: idx_wallet_access_log_address; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wallet_access_log_address ON public.wallet_access_log USING btree (wallet_address);


--
-- Name: idx_wallet_access_log_success; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_wallet_access_log_success ON public.wallet_access_log USING btree (success);


--
-- Name: idx_withdrawal_locks_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_withdrawal_locks_created ON public.withdrawal_locks USING btree (created_at DESC);


--
-- Name: idx_withdrawal_locks_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_withdrawal_locks_status ON public.withdrawal_locks USING btree (status);


--
-- Name: idx_withdrawal_locks_worker; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_withdrawal_locks_worker ON public.withdrawal_locks USING btree (worker_wallet);


--
-- Name: idx_worker_country; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_country ON public.worker_ratings USING btree (last_known_country);


--
-- Name: idx_worker_earnings; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_earnings ON public.worker_ratings USING btree (total_earnings_gstd DESC);


--
-- Name: idx_worker_level; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_level ON public.worker_ratings USING btree (level);


--
-- Name: idx_worker_load_capacity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_load_capacity ON public.worker_load USING btree (current_tasks) WHERE (current_tasks < max_capacity);


--
-- Name: idx_worker_load_last_seen; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_load_last_seen ON public.worker_load USING btree (last_seen);


--
-- Name: idx_worker_rating; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_rating ON public.worker_ratings USING btree (reliability_score DESC);


--
-- Name: idx_worker_xp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_worker_xp ON public.worker_ratings USING btree (xp DESC);


--
-- Name: users trg_generate_ref_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_generate_ref_code BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.generate_referral_code();


--
-- Name: worker_task_assignments fk_assignment_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.worker_task_assignments
    ADD CONSTRAINT fk_assignment_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id) ON DELETE CASCADE;


--
-- Name: task_escrow fk_escrow_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.task_escrow
    ADD CONSTRAINT fk_escrow_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id) ON DELETE CASCADE;


--
-- Name: payout_intents fk_intent_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_intents
    ADD CONSTRAINT fk_intent_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id) ON DELETE CASCADE;


--
-- Name: payout_history fk_payout_history_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_history
    ADD CONSTRAINT fk_payout_history_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id) ON DELETE CASCADE;


--
-- Name: payout_history fk_payout_history_transaction; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payout_history
    ADD CONSTRAINT fk_payout_history_transaction FOREIGN KEY (payout_transaction_id) REFERENCES public.payout_transactions(id) ON DELETE CASCADE;


--
-- Name: topology_metrics fk_topology_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.topology_metrics
    ADD CONSTRAINT fk_topology_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id) ON DELETE CASCADE;


--
-- Name: transaction_history fk_tx_escrow; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT fk_tx_escrow FOREIGN KEY (escrow_id) REFERENCES public.task_escrow(id) ON DELETE SET NULL;


--
-- Name: transaction_history fk_tx_task; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transaction_history
    ADD CONSTRAINT fk_tx_task FOREIGN KEY (task_id) REFERENCES public.tasks(task_id) ON DELETE SET NULL;


--
-- Name: nodes nodes_wallet_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.nodes
    ADD CONSTRAINT nodes_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address) ON DELETE CASCADE;


--
-- Name: referral_rewards referral_rewards_referred_user_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_referred_user_address_fkey FOREIGN KEY (referred_user_address) REFERENCES public.users(wallet_address);


--
-- Name: referral_rewards referral_rewards_referrer_address_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.referral_rewards
    ADD CONSTRAINT referral_rewards_referrer_address_fkey FOREIGN KEY (referrer_address) REFERENCES public.users(wallet_address);


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(wallet_address);


--
-- PostgreSQL database dump complete
--

\unrestrict YOW1a90M7VUR1b4MV6LmGDZshtIE17j6ZHk2e9ZycQGbKVkymEuKpDTbaIECyNk

