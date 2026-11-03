// Generated; regenerate with contracts/scripts/export-escrow-bindings.cjs.
import {
    Cell,
    Slice,
    Address,
    Builder,
    beginCell,
    ComputeError,
    TupleItem,
    TupleReader,
    Dictionary,
    contractAddress,
    address,
    ContractProvider,
    Sender,
    Contract,
    ContractABI,
    ABIType,
    ABIGetter,
    ABIReceiver,
    TupleBuilder,
    DictionaryValue
} from '@ton/core';

export type DataSize = {
    $$type: 'DataSize';
    cells: bigint;
    bits: bigint;
    refs: bigint;
}

export function storeDataSize(src: DataSize) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.cells, 257);
        b_0.storeInt(src.bits, 257);
        b_0.storeInt(src.refs, 257);
    };
}

export function loadDataSize(slice: Slice) {
    const sc_0 = slice;
    const _cells = sc_0.loadIntBig(257);
    const _bits = sc_0.loadIntBig(257);
    const _refs = sc_0.loadIntBig(257);
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadGetterTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function storeTupleDataSize(source: DataSize) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.cells);
    builder.writeNumber(source.bits);
    builder.writeNumber(source.refs);
    return builder.build();
}

export function dictValueParserDataSize(): DictionaryValue<DataSize> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDataSize(src)).endCell());
        },
        parse: (src) => {
            return loadDataSize(src.loadRef().beginParse());
        }
    }
}

export type SignedBundle = {
    $$type: 'SignedBundle';
    signature: Buffer;
    signedData: Slice;
}

export function storeSignedBundle(src: SignedBundle) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBuffer(src.signature);
        b_0.storeBuilder(src.signedData.asBuilder());
    };
}

export function loadSignedBundle(slice: Slice) {
    const sc_0 = slice;
    const _signature = sc_0.loadBuffer(64);
    const _signedData = sc_0;
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadGetterTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function storeTupleSignedBundle(source: SignedBundle) {
    const builder = new TupleBuilder();
    builder.writeBuffer(source.signature);
    builder.writeSlice(source.signedData.asCell());
    return builder.build();
}

export function dictValueParserSignedBundle(): DictionaryValue<SignedBundle> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSignedBundle(src)).endCell());
        },
        parse: (src) => {
            return loadSignedBundle(src.loadRef().beginParse());
        }
    }
}

export type StateInit = {
    $$type: 'StateInit';
    code: Cell;
    data: Cell;
}

export function storeStateInit(src: StateInit) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeRef(src.code);
        b_0.storeRef(src.data);
    };
}

export function loadStateInit(slice: Slice) {
    const sc_0 = slice;
    const _code = sc_0.loadRef();
    const _data = sc_0.loadRef();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadGetterTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function storeTupleStateInit(source: StateInit) {
    const builder = new TupleBuilder();
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    return builder.build();
}

export function dictValueParserStateInit(): DictionaryValue<StateInit> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStateInit(src)).endCell());
        },
        parse: (src) => {
            return loadStateInit(src.loadRef().beginParse());
        }
    }
}

export type Context = {
    $$type: 'Context';
    bounceable: boolean;
    sender: Address;
    value: bigint;
    raw: Slice;
}

export function storeContext(src: Context) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBit(src.bounceable);
        b_0.storeAddress(src.sender);
        b_0.storeInt(src.value, 257);
        b_0.storeRef(src.raw.asCell());
    };
}

export function loadContext(slice: Slice) {
    const sc_0 = slice;
    const _bounceable = sc_0.loadBit();
    const _sender = sc_0.loadAddress();
    const _value = sc_0.loadIntBig(257);
    const _raw = sc_0.loadRef().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadGetterTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function storeTupleContext(source: Context) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.bounceable);
    builder.writeAddress(source.sender);
    builder.writeNumber(source.value);
    builder.writeSlice(source.raw.asCell());
    return builder.build();
}

export function dictValueParserContext(): DictionaryValue<Context> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeContext(src)).endCell());
        },
        parse: (src) => {
            return loadContext(src.loadRef().beginParse());
        }
    }
}

export type SendParameters = {
    $$type: 'SendParameters';
    mode: bigint;
    body: Cell | null;
    code: Cell | null;
    data: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeSendParameters(src: SendParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        if (src.code !== null && src.code !== undefined) { b_0.storeBit(true).storeRef(src.code); } else { b_0.storeBit(false); }
        if (src.data !== null && src.data !== undefined) { b_0.storeBit(true).storeRef(src.data); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadSendParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _code = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _data = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleSendParameters(source: SendParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserSendParameters(): DictionaryValue<SendParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSendParameters(src)).endCell());
        },
        parse: (src) => {
            return loadSendParameters(src.loadRef().beginParse());
        }
    }
}

export type MessageParameters = {
    $$type: 'MessageParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeMessageParameters(src: MessageParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadMessageParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleMessageParameters(source: MessageParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserMessageParameters(): DictionaryValue<MessageParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMessageParameters(src)).endCell());
        },
        parse: (src) => {
            return loadMessageParameters(src.loadRef().beginParse());
        }
    }
}

export type DeployParameters = {
    $$type: 'DeployParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    bounce: boolean;
    init: StateInit;
}

export function storeDeployParameters(src: DeployParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeBit(src.bounce);
        b_0.store(storeStateInit(src.init));
    };
}

export function loadDeployParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _bounce = sc_0.loadBit();
    const _init = loadStateInit(sc_0);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadGetterTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadGetterTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function storeTupleDeployParameters(source: DeployParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeBoolean(source.bounce);
    builder.writeTuple(storeTupleStateInit(source.init));
    return builder.build();
}

export function dictValueParserDeployParameters(): DictionaryValue<DeployParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployParameters(src)).endCell());
        },
        parse: (src) => {
            return loadDeployParameters(src.loadRef().beginParse());
        }
    }
}

export type StdAddress = {
    $$type: 'StdAddress';
    workchain: bigint;
    address: bigint;
}

export function storeStdAddress(src: StdAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 8);
        b_0.storeUint(src.address, 256);
    };
}

export function loadStdAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(8);
    const _address = sc_0.loadUintBig(256);
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleStdAddress(source: StdAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeNumber(source.address);
    return builder.build();
}

export function dictValueParserStdAddress(): DictionaryValue<StdAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStdAddress(src)).endCell());
        },
        parse: (src) => {
            return loadStdAddress(src.loadRef().beginParse());
        }
    }
}

export type VarAddress = {
    $$type: 'VarAddress';
    workchain: bigint;
    address: Slice;
}

export function storeVarAddress(src: VarAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 32);
        b_0.storeRef(src.address.asCell());
    };
}

export function loadVarAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(32);
    const _address = sc_0.loadRef().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleVarAddress(source: VarAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeSlice(source.address.asCell());
    return builder.build();
}

export function dictValueParserVarAddress(): DictionaryValue<VarAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeVarAddress(src)).endCell());
        },
        parse: (src) => {
            return loadVarAddress(src.loadRef().beginParse());
        }
    }
}

export type BasechainAddress = {
    $$type: 'BasechainAddress';
    hash: bigint | null;
}

export function storeBasechainAddress(src: BasechainAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        if (src.hash !== null && src.hash !== undefined) { b_0.storeBit(true).storeInt(src.hash, 257); } else { b_0.storeBit(false); }
    };
}

export function loadBasechainAddress(slice: Slice) {
    const sc_0 = slice;
    const _hash = sc_0.loadBit() ? sc_0.loadIntBig(257) : null;
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadGetterTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function storeTupleBasechainAddress(source: BasechainAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.hash);
    return builder.build();
}

export function dictValueParserBasechainAddress(): DictionaryValue<BasechainAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBasechainAddress(src)).endCell());
        },
        parse: (src) => {
            return loadBasechainAddress(src.loadRef().beginParse());
        }
    }
}

export type Deploy = {
    $$type: 'Deploy';
    queryId: bigint;
}

export function storeDeploy(src: Deploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2490013878, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2490013878) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadGetterTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function storeTupleDeploy(source: Deploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeploy(): DictionaryValue<Deploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadDeploy(src.loadRef().beginParse());
        }
    }
}

export type DeployOk = {
    $$type: 'DeployOk';
    queryId: bigint;
}

export function storeDeployOk(src: DeployOk) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2952335191, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeployOk(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2952335191) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadGetterTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function storeTupleDeployOk(source: DeployOk) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeployOk(): DictionaryValue<DeployOk> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployOk(src)).endCell());
        },
        parse: (src) => {
            return loadDeployOk(src.loadRef().beginParse());
        }
    }
}

export type FactoryDeploy = {
    $$type: 'FactoryDeploy';
    queryId: bigint;
    cashback: Address;
}

export function storeFactoryDeploy(src: FactoryDeploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1829761339, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.cashback);
    };
}

export function loadFactoryDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1829761339) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _cashback = sc_0.loadAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadGetterTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function storeTupleFactoryDeploy(source: FactoryDeploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeAddress(source.cashback);
    return builder.build();
}

export function dictValueParserFactoryDeploy(): DictionaryValue<FactoryDeploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFactoryDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadFactoryDeploy(src.loadRef().beginParse());
        }
    }
}

export type AcceptFundedTask = {
    $$type: 'AcceptFundedTask';
}

export function storeAcceptFundedTask(src: AcceptFundedTask) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705025, 32);
    };
}

export function loadAcceptFundedTask(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705025) { throw Error('Invalid prefix'); }
    return { $$type: 'AcceptFundedTask' as const };
}

export function loadTupleAcceptFundedTask(source: TupleReader) {
    return { $$type: 'AcceptFundedTask' as const };
}

export function loadGetterTupleAcceptFundedTask(source: TupleReader) {
    return { $$type: 'AcceptFundedTask' as const };
}

export function storeTupleAcceptFundedTask(source: AcceptFundedTask) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserAcceptFundedTask(): DictionaryValue<AcceptFundedTask> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeAcceptFundedTask(src)).endCell());
        },
        parse: (src) => {
            return loadAcceptFundedTask(src.loadRef().beginParse());
        }
    }
}

export type WithdrawAcceptedShare = {
    $$type: 'WithdrawAcceptedShare';
    amount: bigint;
    queryId: bigint;
}

export function storeWithdrawAcceptedShare(src: WithdrawAcceptedShare) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705026, 32);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadWithdrawAcceptedShare(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705026) { throw Error('Invalid prefix'); }
    const _amount = sc_0.loadCoins();
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'WithdrawAcceptedShare' as const, amount: _amount, queryId: _queryId };
}

export function loadTupleWithdrawAcceptedShare(source: TupleReader) {
    const _amount = source.readBigNumber();
    const _queryId = source.readBigNumber();
    return { $$type: 'WithdrawAcceptedShare' as const, amount: _amount, queryId: _queryId };
}

export function loadGetterTupleWithdrawAcceptedShare(source: TupleReader) {
    const _amount = source.readBigNumber();
    const _queryId = source.readBigNumber();
    return { $$type: 'WithdrawAcceptedShare' as const, amount: _amount, queryId: _queryId };
}

export function storeTupleWithdrawAcceptedShare(source: WithdrawAcceptedShare) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.amount);
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserWithdrawAcceptedShare(): DictionaryValue<WithdrawAcceptedShare> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeWithdrawAcceptedShare(src)).endCell());
        },
        parse: (src) => {
            return loadWithdrawAcceptedShare(src.loadRef().beginParse());
        }
    }
}

export type RefundExpiredShare = {
    $$type: 'RefundExpiredShare';
    amount: bigint;
    queryId: bigint;
}

export function storeRefundExpiredShare(src: RefundExpiredShare) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705027, 32);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadRefundExpiredShare(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705027) { throw Error('Invalid prefix'); }
    const _amount = sc_0.loadCoins();
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'RefundExpiredShare' as const, amount: _amount, queryId: _queryId };
}

export function loadTupleRefundExpiredShare(source: TupleReader) {
    const _amount = source.readBigNumber();
    const _queryId = source.readBigNumber();
    return { $$type: 'RefundExpiredShare' as const, amount: _amount, queryId: _queryId };
}

export function loadGetterTupleRefundExpiredShare(source: TupleReader) {
    const _amount = source.readBigNumber();
    const _queryId = source.readBigNumber();
    return { $$type: 'RefundExpiredShare' as const, amount: _amount, queryId: _queryId };
}

export function storeTupleRefundExpiredShare(source: RefundExpiredShare) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.amount);
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserRefundExpiredShare(): DictionaryValue<RefundExpiredShare> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeRefundExpiredShare(src)).endCell());
        },
        parse: (src) => {
            return loadRefundExpiredShare(src.loadRef().beginParse());
        }
    }
}

export type SyncTask = {
    $$type: 'SyncTask';
}

export function storeSyncTask(src: SyncTask) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705028, 32);
    };
}

export function loadSyncTask(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705028) { throw Error('Invalid prefix'); }
    return { $$type: 'SyncTask' as const };
}

export function loadTupleSyncTask(source: TupleReader) {
    return { $$type: 'SyncTask' as const };
}

export function loadGetterTupleSyncTask(source: TupleReader) {
    return { $$type: 'SyncTask' as const };
}

export function storeTupleSyncTask(source: SyncTask) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserSyncTask(): DictionaryValue<SyncTask> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSyncTask(src)).endCell());
        },
        parse: (src) => {
            return loadSyncTask(src.loadRef().beginParse());
        }
    }
}

export type RefundExpiredTask = {
    $$type: 'RefundExpiredTask';
}

export function storeRefundExpiredTask(src: RefundExpiredTask) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705029, 32);
    };
}

export function loadRefundExpiredTask(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705029) { throw Error('Invalid prefix'); }
    return { $$type: 'RefundExpiredTask' as const };
}

export function loadTupleRefundExpiredTask(source: TupleReader) {
    return { $$type: 'RefundExpiredTask' as const };
}

export function loadGetterTupleRefundExpiredTask(source: TupleReader) {
    return { $$type: 'RefundExpiredTask' as const };
}

export function storeTupleRefundExpiredTask(source: RefundExpiredTask) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserRefundExpiredTask(): DictionaryValue<RefundExpiredTask> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeRefundExpiredTask(src)).endCell());
        },
        parse: (src) => {
            return loadRefundExpiredTask(src.loadRef().beginParse());
        }
    }
}

export type CommitTask = {
    $$type: 'CommitTask';
    phase: bigint;
}

export function storeCommitTask(src: CommitTask) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705030, 32);
        b_0.storeUint(src.phase, 8);
    };
}

export function loadCommitTask(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705030) { throw Error('Invalid prefix'); }
    const _phase = sc_0.loadUintBig(8);
    return { $$type: 'CommitTask' as const, phase: _phase };
}

export function loadTupleCommitTask(source: TupleReader) {
    const _phase = source.readBigNumber();
    return { $$type: 'CommitTask' as const, phase: _phase };
}

export function loadGetterTupleCommitTask(source: TupleReader) {
    const _phase = source.readBigNumber();
    return { $$type: 'CommitTask' as const, phase: _phase };
}

export function storeTupleCommitTask(source: CommitTask) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.phase);
    return builder.build();
}

export function dictValueParserCommitTask(): DictionaryValue<CommitTask> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeCommitTask(src)).endCell());
        },
        parse: (src) => {
            return loadCommitTask(src.loadRef().beginParse());
        }
    }
}

export type FundingReady = {
    $$type: 'FundingReady';
    role: bigint;
}

export function storeFundingReady(src: FundingReady) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705031, 32);
        b_0.storeUint(src.role, 8);
    };
}

export function loadFundingReady(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705031) { throw Error('Invalid prefix'); }
    const _role = sc_0.loadUintBig(8);
    return { $$type: 'FundingReady' as const, role: _role };
}

export function loadTupleFundingReady(source: TupleReader) {
    const _role = source.readBigNumber();
    return { $$type: 'FundingReady' as const, role: _role };
}

export function loadGetterTupleFundingReady(source: TupleReader) {
    const _role = source.readBigNumber();
    return { $$type: 'FundingReady' as const, role: _role };
}

export function storeTupleFundingReady(source: FundingReady) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.role);
    return builder.build();
}

export function dictValueParserFundingReady(): DictionaryValue<FundingReady> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFundingReady(src)).endCell());
        },
        parse: (src) => {
            return loadFundingReady(src.loadRef().beginParse());
        }
    }
}

export type ReportFunding = {
    $$type: 'ReportFunding';
}

export function storeReportFunding(src: ReportFunding) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705032, 32);
    };
}

export function loadReportFunding(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705032) { throw Error('Invalid prefix'); }
    return { $$type: 'ReportFunding' as const };
}

export function loadTupleReportFunding(source: TupleReader) {
    return { $$type: 'ReportFunding' as const };
}

export function loadGetterTupleReportFunding(source: TupleReader) {
    return { $$type: 'ReportFunding' as const };
}

export function storeTupleReportFunding(source: ReportFunding) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserReportFunding(): DictionaryValue<ReportFunding> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeReportFunding(src)).endCell());
        },
        parse: (src) => {
            return loadReportFunding(src.loadRef().beginParse());
        }
    }
}

export type ReclaimEscrowTon = {
    $$type: 'ReclaimEscrowTon';
}

export function storeReclaimEscrowTon(src: ReclaimEscrowTon) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705033, 32);
    };
}

export function loadReclaimEscrowTon(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705033) { throw Error('Invalid prefix'); }
    return { $$type: 'ReclaimEscrowTon' as const };
}

export function loadTupleReclaimEscrowTon(source: TupleReader) {
    return { $$type: 'ReclaimEscrowTon' as const };
}

export function loadGetterTupleReclaimEscrowTon(source: TupleReader) {
    return { $$type: 'ReclaimEscrowTon' as const };
}

export function storeTupleReclaimEscrowTon(source: ReclaimEscrowTon) {
    const builder = new TupleBuilder();
    return builder.build();
}

export function dictValueParserReclaimEscrowTon(): DictionaryValue<ReclaimEscrowTon> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeReclaimEscrowTon(src)).endCell());
        },
        parse: (src) => {
            return loadReclaimEscrowTon(src.loadRef().beginParse());
        }
    }
}

export type EscrowGstdReceived = {
    $$type: 'EscrowGstdReceived';
    queryId: bigint;
    amount: bigint;
    from: Address;
    forwardPayload: Slice;
}

export function storeEscrowGstdReceived(src: EscrowGstdReceived) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1935855772, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.from);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export function loadEscrowGstdReceived(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1935855772) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _from = sc_0.loadAddress();
    const _forwardPayload = sc_0;
    return { $$type: 'EscrowGstdReceived' as const, queryId: _queryId, amount: _amount, from: _from, forwardPayload: _forwardPayload };
}

export function loadTupleEscrowGstdReceived(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _from = source.readAddress();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'EscrowGstdReceived' as const, queryId: _queryId, amount: _amount, from: _from, forwardPayload: _forwardPayload };
}

export function loadGetterTupleEscrowGstdReceived(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _from = source.readAddress();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'EscrowGstdReceived' as const, queryId: _queryId, amount: _amount, from: _from, forwardPayload: _forwardPayload };
}

export function storeTupleEscrowGstdReceived(source: EscrowGstdReceived) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeAddress(source.from);
    builder.writeSlice(source.forwardPayload.asCell());
    return builder.build();
}

export function dictValueParserEscrowGstdReceived(): DictionaryValue<EscrowGstdReceived> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeEscrowGstdReceived(src)).endCell());
        },
        parse: (src) => {
            return loadEscrowGstdReceived(src.loadRef().beginParse());
        }
    }
}

export type EscrowExcess = {
    $$type: 'EscrowExcess';
    queryId: bigint;
}

export function storeEscrowExcess(src: EscrowExcess) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(3576854235, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadEscrowExcess(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 3576854235) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'EscrowExcess' as const, queryId: _queryId };
}

export function loadTupleEscrowExcess(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'EscrowExcess' as const, queryId: _queryId };
}

export function loadGetterTupleEscrowExcess(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'EscrowExcess' as const, queryId: _queryId };
}

export function storeTupleEscrowExcess(source: EscrowExcess) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserEscrowExcess(): DictionaryValue<EscrowExcess> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeEscrowExcess(src)).endCell());
        },
        parse: (src) => {
            return loadEscrowExcess(src.loadRef().beginParse());
        }
    }
}

export type GstdEscrowShare$Data = {
    $$type: 'GstdEscrowShare$Data';
    coordinator: Address;
    payer: Address;
    beneficiary: Address;
    role: bigint;
    requiredAmount: bigint;
    walletCode: Cell;
    master: Address;
    network: bigint;
    funded: bigint;
    phase: bigint;
}

export function storeGstdEscrowShare$Data(src: GstdEscrowShare$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.coordinator);
        b_0.storeAddress(src.payer);
        b_0.storeAddress(src.beneficiary);
        b_0.storeUint(src.role, 8);
        b_0.storeCoins(src.requiredAmount);
        b_0.storeRef(src.walletCode);
        const b_1 = new Builder();
        b_1.storeAddress(src.master);
        b_1.storeInt(src.network, 32);
        b_1.storeCoins(src.funded);
        b_1.storeUint(src.phase, 8);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadGstdEscrowShare$Data(slice: Slice) {
    const sc_0 = slice;
    const _coordinator = sc_0.loadAddress();
    const _payer = sc_0.loadAddress();
    const _beneficiary = sc_0.loadAddress();
    const _role = sc_0.loadUintBig(8);
    const _requiredAmount = sc_0.loadCoins();
    const _walletCode = sc_0.loadRef();
    const sc_1 = sc_0.loadRef().beginParse();
    const _master = sc_1.loadAddress();
    const _network = sc_1.loadIntBig(32);
    const _funded = sc_1.loadCoins();
    const _phase = sc_1.loadUintBig(8);
    return { $$type: 'GstdEscrowShare$Data' as const, coordinator: _coordinator, payer: _payer, beneficiary: _beneficiary, role: _role, requiredAmount: _requiredAmount, walletCode: _walletCode, master: _master, network: _network, funded: _funded, phase: _phase };
}

export function loadTupleGstdEscrowShare$Data(source: TupleReader) {
    const _coordinator = source.readAddress();
    const _payer = source.readAddress();
    const _beneficiary = source.readAddress();
    const _role = source.readBigNumber();
    const _requiredAmount = source.readBigNumber();
    const _walletCode = source.readCell();
    const _master = source.readAddress();
    const _network = source.readBigNumber();
    const _funded = source.readBigNumber();
    const _phase = source.readBigNumber();
    return { $$type: 'GstdEscrowShare$Data' as const, coordinator: _coordinator, payer: _payer, beneficiary: _beneficiary, role: _role, requiredAmount: _requiredAmount, walletCode: _walletCode, master: _master, network: _network, funded: _funded, phase: _phase };
}

export function loadGetterTupleGstdEscrowShare$Data(source: TupleReader) {
    const _coordinator = source.readAddress();
    const _payer = source.readAddress();
    const _beneficiary = source.readAddress();
    const _role = source.readBigNumber();
    const _requiredAmount = source.readBigNumber();
    const _walletCode = source.readCell();
    const _master = source.readAddress();
    const _network = source.readBigNumber();
    const _funded = source.readBigNumber();
    const _phase = source.readBigNumber();
    return { $$type: 'GstdEscrowShare$Data' as const, coordinator: _coordinator, payer: _payer, beneficiary: _beneficiary, role: _role, requiredAmount: _requiredAmount, walletCode: _walletCode, master: _master, network: _network, funded: _funded, phase: _phase };
}

export function storeTupleGstdEscrowShare$Data(source: GstdEscrowShare$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.coordinator);
    builder.writeAddress(source.payer);
    builder.writeAddress(source.beneficiary);
    builder.writeNumber(source.role);
    builder.writeNumber(source.requiredAmount);
    builder.writeCell(source.walletCode);
    builder.writeAddress(source.master);
    builder.writeNumber(source.network);
    builder.writeNumber(source.funded);
    builder.writeNumber(source.phase);
    return builder.build();
}

export function dictValueParserGstdEscrowShare$Data(): DictionaryValue<GstdEscrowShare$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeGstdEscrowShare$Data(src)).endCell());
        },
        parse: (src) => {
            return loadGstdEscrowShare$Data(src.loadRef().beginParse());
        }
    }
}

export type GstdTaskEscrow$Data = {
    $$type: 'GstdTaskEscrow$Data';
    payer: Address;
    worker: Address;
    protocol: Address;
    reserve: Address;
    taskId: bigint;
    budget: bigint;
    deadline: bigint;
    walletCode: Cell;
    master: Address;
    network: bigint;
    phase: bigint;
    readyMask: bigint;
}

export function storeGstdTaskEscrow$Data(src: GstdTaskEscrow$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.payer);
        b_0.storeAddress(src.worker);
        b_0.storeAddress(src.protocol);
        const b_1 = new Builder();
        b_1.storeAddress(src.reserve);
        b_1.storeUint(src.taskId, 256);
        b_1.storeCoins(src.budget);
        b_1.storeUint(src.deadline, 64);
        b_1.storeRef(src.walletCode);
        b_1.storeAddress(src.master);
        b_1.storeInt(src.network, 32);
        b_1.storeUint(src.phase, 8);
        const b_2 = new Builder();
        b_2.storeUint(src.readyMask, 8);
        b_1.storeRef(b_2.endCell());
        b_0.storeRef(b_1.endCell());
    };
}

export function loadGstdTaskEscrow$Data(slice: Slice) {
    const sc_0 = slice;
    const _payer = sc_0.loadAddress();
    const _worker = sc_0.loadAddress();
    const _protocol = sc_0.loadAddress();
    const sc_1 = sc_0.loadRef().beginParse();
    const _reserve = sc_1.loadAddress();
    const _taskId = sc_1.loadUintBig(256);
    const _budget = sc_1.loadCoins();
    const _deadline = sc_1.loadUintBig(64);
    const _walletCode = sc_1.loadRef();
    const _master = sc_1.loadAddress();
    const _network = sc_1.loadIntBig(32);
    const _phase = sc_1.loadUintBig(8);
    const sc_2 = sc_1.loadRef().beginParse();
    const _readyMask = sc_2.loadUintBig(8);
    return { $$type: 'GstdTaskEscrow$Data' as const, payer: _payer, worker: _worker, protocol: _protocol, reserve: _reserve, taskId: _taskId, budget: _budget, deadline: _deadline, walletCode: _walletCode, master: _master, network: _network, phase: _phase, readyMask: _readyMask };
}

export function loadTupleGstdTaskEscrow$Data(source: TupleReader) {
    const _payer = source.readAddress();
    const _worker = source.readAddress();
    const _protocol = source.readAddress();
    const _reserve = source.readAddress();
    const _taskId = source.readBigNumber();
    const _budget = source.readBigNumber();
    const _deadline = source.readBigNumber();
    const _walletCode = source.readCell();
    const _master = source.readAddress();
    const _network = source.readBigNumber();
    const _phase = source.readBigNumber();
    const _readyMask = source.readBigNumber();
    return { $$type: 'GstdTaskEscrow$Data' as const, payer: _payer, worker: _worker, protocol: _protocol, reserve: _reserve, taskId: _taskId, budget: _budget, deadline: _deadline, walletCode: _walletCode, master: _master, network: _network, phase: _phase, readyMask: _readyMask };
}

export function loadGetterTupleGstdTaskEscrow$Data(source: TupleReader) {
    const _payer = source.readAddress();
    const _worker = source.readAddress();
    const _protocol = source.readAddress();
    const _reserve = source.readAddress();
    const _taskId = source.readBigNumber();
    const _budget = source.readBigNumber();
    const _deadline = source.readBigNumber();
    const _walletCode = source.readCell();
    const _master = source.readAddress();
    const _network = source.readBigNumber();
    const _phase = source.readBigNumber();
    const _readyMask = source.readBigNumber();
    return { $$type: 'GstdTaskEscrow$Data' as const, payer: _payer, worker: _worker, protocol: _protocol, reserve: _reserve, taskId: _taskId, budget: _budget, deadline: _deadline, walletCode: _walletCode, master: _master, network: _network, phase: _phase, readyMask: _readyMask };
}

export function storeTupleGstdTaskEscrow$Data(source: GstdTaskEscrow$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.payer);
    builder.writeAddress(source.worker);
    builder.writeAddress(source.protocol);
    builder.writeAddress(source.reserve);
    builder.writeNumber(source.taskId);
    builder.writeNumber(source.budget);
    builder.writeNumber(source.deadline);
    builder.writeCell(source.walletCode);
    builder.writeAddress(source.master);
    builder.writeNumber(source.network);
    builder.writeNumber(source.phase);
    builder.writeNumber(source.readyMask);
    return builder.build();
}

export function dictValueParserGstdTaskEscrow$Data(): DictionaryValue<GstdTaskEscrow$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeGstdTaskEscrow$Data(src)).endCell());
        },
        parse: (src) => {
            return loadGstdTaskEscrow$Data(src.loadRef().beginParse());
        }
    }
}

 type GstdTaskEscrow_init_args = {
    $$type: 'GstdTaskEscrow_init_args';
    payer: Address;
    worker: Address;
    protocol: Address;
    reserve: Address;
    taskId: bigint;
    budget: bigint;
    deadline: bigint;
    walletCode: Cell;
    master: Address;
    network: bigint;
}

function initGstdTaskEscrow_init_args(src: GstdTaskEscrow_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.payer);
        b_0.storeAddress(src.worker);
        b_0.storeAddress(src.protocol);
        const b_1 = new Builder();
        b_1.storeAddress(src.reserve);
        b_1.storeInt(src.taskId, 257);
        b_1.storeInt(src.budget, 257);
        const b_2 = new Builder();
        b_2.storeInt(src.deadline, 257);
        b_2.storeRef(src.walletCode);
        b_2.storeAddress(src.master);
        b_2.storeInt(src.network, 257);
        b_1.storeRef(b_2.endCell());
        b_0.storeRef(b_1.endCell());
    };
}

async function GstdTaskEscrow_init(payer: Address, worker: Address, protocol: Address, reserve: Address, taskId: bigint, budget: bigint, deadline: bigint, walletCode: Cell, master: Address, network: bigint) {
    const __code = Cell.fromBoc(Buffer.from('b5ee9c7241023e0100100a000114ff00f4a413f4bcf2c80b01020162021102f8d001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e26fa40fa40fa40d401d0fa40d3fffa00d33fd4fa40d21fd307d430d0d30730109c109b109a6c1c8eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700d4fa40810101d70030107a107910780ad15508db3ce20d360304d08e313b109b5518c87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed54e0702cd74920c21f95310cd31f0dde21821047544504bae30221821047544507bae30221821047544501bae30221821047544505ba0405060701685b3b109b5518db3cc87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed540802e25b0bd30730814bc521c103f2f48200f776f84210bc10ac109c108c107c106c105c104c103c4cde2cdb3c705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d01fc7051df2f40aae1cb1108b107a106910581047103645401023180d01be5b3b81735ef8422bc705f2f481578b2bc302f2f42a8e153a8200d562f82324bbf2f481262e2bc007f2f4710adf109b5518db3cc87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed540804cc8ec75b812cbf3cc3011bf2f48154fdf82324bcf2f4108a55177201db3cc87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed54e021821047544509bae302218210d53276dbbae302218210946a98b6ba080c0e0f01f082009c59f8416f24135f03821011e1a300bef2f4f8276f10f8416f24135f03a1208209312d00b996308209312d00de72fb02709320c1038ae830f8427081008270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb000903fc55b02cdb3c5c705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d0821004c4b400717f27c80182104754450658cb1fcb07c910461035443010464515504403c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf818ae2f400c901fb000ca410bc180a0b001a58cf8680cf8480f400f400cf81002410ab109a108910781067105610451034413001d05b3b81735ef8422bc705f2f48200a5bff8416f24135f038209c9c380bef2f48209312d0072fb02297081008270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00109b55180d0058c87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed5400645b3b109b5518c87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed5401fe8e755b0bd33f30c8018210aff90f5758cb1fcb3fc910ac109b108a10791068105710461035443012f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb00c87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed54e03dc0000cc1211c100072b08e30109b5518c87f01ca0055b050bcce19ce17ce05c8ce14cbff58fa02cb3fcc12ce12ca1f12cb0702c8cb0712cdcdc9ed54e05f0cf2c0820201201215020120131402d3baf15ed44d0d200018e26fa40fa40fa40d401d0fa40d3fffa00d33fd4fa40d21fd307d430d0d30730109c109b109a6c1c8eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700d4fa40810101d70030107a107910780ad15508db3ce2db3c6cc18362e02d3ba212ed44d0d200018e26fa40fa40fa40d401d0fa40d3fffa00d33fd4fa40d21fd307d430d0d30730109c109b109a6c1c8eb2fa40fa40fa40d401d0fa40810101d700810101d700d430d0810101d700d4fa40810101d70030107a107910780ad15508db3ce2db3c6cc183630020272163502d7ad11f6a268690000c7137d207d207d206a00e87d2069fffd00699fea7d20690fe983ea1868698398084e084d884d360e47597d207d207d206a00e87d20408080eb80408080eb806a1868408080eb806a7d20408080eb8018083d083c883c0568aa846d9e712a85ed9e3660c03617015edb3c705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d0180382814bc521c2ff9321c1039170e2f2f4f8282d55b22edb3c55b02fdb3c104f103e102d011110015475fedb3c109d108c107b106a1059104810371026104510341023193d1a00162092302ae1c0019129e028015688c87001ca0055715078ce15ce13ce01c8810101cf0012810101cf0012cc12ce02c8810101cf0012cdcdc91b0114ff00f4a413f4bcf2c80b1c0201621d2b03f6d001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e25fa40fa40fa40d307fa00d4d401d0fa40d21ffa00d30730104a104910481047104610456c1a8ea9fa40fa40fa40d401d0810101d700810101d700d4fa40d430d0810101d7003010581057105608d15506e20be302702ad74920c21f321e1f00543910795516c87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed5404dc95310ad31f0bde2182107362d09cbae30221821047544508ba8ec05b398200e663f8416f24135f038209c9c380bef2f410795516db3cc87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed54e021821047544506bae30221821047544502ba2021222302f05b09d33f31fa00308200c161f842109a108a107a106a105a104a103a4abcdb3c1dc7051bf2f45098a05302be8e98106910581047103645044013db3c09103847161035441359de106910581047103645044013c87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed54342100b08110725326bef2f482084c4b40717f29c80182104754450758cb1fcb07c92d553010246d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00009e5b09d3073082008595f8422ac705f2f48115c421c103f2f42a992a8200b9d402baf2f4913ae210795516c87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed5404e68ed35b09fa00d33f308200b791f84229c705f2f48153ca2cc001f2f42710ac109b0a107910681057104603054444db3cc87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed54e021821047544503bae3023b20821047544509bae302208210d53276dbba2524282a01a45b09fa00d33f3081735ef8422ac705f2f481380c2cc002f2f42810ac0b108a107910681057104610355530db3cc87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed542502f4811c1522c200f2f48200b4abf8416f24135f03821004c4b400bef2f4f8276f10f8416f24135f03a1208209312d00b996308209312d00de72fb02109c108b107a106c105b104a103c4bacdb3c820afaf080717f7070c882100f8a7ea501cb1f01111301cb3f011110fa025610cf16011110cf1601111001ca002f342601fcfa021dca00c914103c4ed010246d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00f8427081008270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c90127000cfb001069552501d0303981735ef84228c705f2f48200a5bff8416f24135f038209c9c380bef2f48209312d0072fb02267081008270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb001079551629004ac87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed5400cc8e2b303910795516c87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed54e0c0000ac1211ab08e2910795516c87f01ca005590509ace17ce15ce13cb0701fa02cc01c8ce12ca1f58fa0212cb07cdc9ed54e05f0af2c0820201202c310201482d2f02bfb542dda89a1a400031c4bf481f481f481a60ff401a9a803a1f481a43ff401a60e60209420922090208e208c208ad8351d53f481f481f481a803a1020203ae01020203ae01a9f481a861a1020203ae006020b020ae20ac11a2aa0dc5b678d9430322e00022102bfb5e2bda89a1a400031c4bf481f481f481a60ff401a9a803a1f481a43ff401a60e60209420922090208e208c208ad8351d53f481f481f481a803a1020203ae01020203ae01a9f481a861a1020203ae006020b020ae20ac11a2aa0dc5b678d9430323000022002bfbc34476a268690000c712fd207d207d206983fd006a6a00e87d20690ffd00698398082508248824082388230822b60d4754fd207d207d206a00e8408080eb80408080eb806a7d206a1868408080eb8018082c082b882b0468aa83716d9e3650c323302d88200a5d725c2ff9325c1039170e29324c2009170e2f2f48111bd23f90082f0a46ef8746f4ea669c2ce9455be129b693cd1c638cb021faaac58c7df01e0a163baf2f48200e39f8013f833d08020db3c22ba9c2181ff11ba917f9321c0fde29170e2f2f42081ff11bae300702037380104db3c34007c70c870fa02f828cf1625cf16ca00c95250705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d002d7adba76a268690000c7137d207d207d206a00e87d2069fffd00699fea7d20690fe983ea1868698398084e084d884d360e47597d207d207d206a00e87d20408080eb80408080eb806a1868408080eb806a7d20408080eb8018083d083c883c0568aa846d9e712a85ed9e3660c0363c03f48200e33925c2639324c2009170e2f2f48111bd23f90082f0a46ef8746f4ea669c2ce9455be129b693cd1c638cb021faaac58c7df01e0a163baf2f48200e39f8013f833d08020db3c22ba9c2181ff11ba917f9321c0fde29170e2f2f42081ff11bae300547987297020105c104b103a102910481037102655040f3738390006d70030005a8158e08d0860077f4e30b7b39b11519bb9b84be07d000c6a443eb030faca8ccc2f9fdfdedacd945230c705f2f40418db3c550cdb3c550bdb3c550b3b3b3b3a0104db3c3b008882008bec8d08600000000000000000000000000000000000000000000000000000000000000000045220c705b3f2f4c801cf16c9d073d72182008a2701d20730c000f2f40122814bc521c2ff9321c1039170e2f2f4db3c3d005020983026a7558064a904e1c0019726a70a8064a904e026a7558064a9045270a127a70a8064a904a17e8de061','hex'))[0];
    const builder = beginCell();
    builder.storeUint(0, 1);
    initGstdTaskEscrow_init_args({ $$type: 'GstdTaskEscrow_init_args', payer, worker, protocol, reserve, taskId, budget, deadline, walletCode, master, network })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

export const GstdTaskEscrow_errors = {
    2: { message: "Stack underflow" },
    3: { message: "Stack overflow" },
    4: { message: "Integer overflow" },
    5: { message: "Integer out of expected range" },
    6: { message: "Invalid opcode" },
    7: { message: "Type check error" },
    8: { message: "Cell overflow" },
    9: { message: "Cell underflow" },
    10: { message: "Dictionary error" },
    11: { message: "'Unknown' error" },
    12: { message: "Fatal error" },
    13: { message: "Out of gas error" },
    14: { message: "Virtualization error" },
    32: { message: "Action list is invalid" },
    33: { message: "Action list is too long" },
    34: { message: "Action is invalid or not supported" },
    35: { message: "Invalid source address in outbound message" },
    36: { message: "Invalid destination address in outbound message" },
    37: { message: "Not enough Toncoin" },
    38: { message: "Not enough extra currencies" },
    39: { message: "Outbound message does not fit into a cell after rewriting" },
    40: { message: "Cannot process a message" },
    41: { message: "Library reference is null" },
    42: { message: "Library change action error" },
    43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
    50: { message: "Account state size exceeded limits" },
    128: { message: "Null reference exception" },
    129: { message: "Invalid serialization prefix" },
    130: { message: "Invalid incoming message" },
    131: { message: "Constraints error" },
    132: { message: "Access denied" },
    133: { message: "Contract stopped" },
    134: { message: "Invalid argument" },
    135: { message: "Code of a contract was not found" },
    136: { message: "Invalid standard address" },
    138: { message: "Not a basechain address" },
    4210: { message: "Share not funded" },
    4541: { message: "Noncanonical wallet code" },
    5572: { message: "Invalid phase" },
    7189: { message: "Zero amount" },
    9774: { message: "Task not fully funded" },
    11455: { message: "Accepted work cannot be refunded" },
    14348: { message: "Refund not authorized" },
    19397: { message: "Invalid role" },
    21450: { message: "Task not accepted" },
    21757: { message: "Task still active" },
    22411: { message: "Already refunded" },
    22752: { message: "Canonical GSTD only" },
    29534: { message: "Payer only" },
    34197: { message: "Coordinator only" },
    35367: { message: "Basechain only" },
    35820: { message: "Zero recipient" },
    40025: { message: "Attach 0.30 TON sync budget" },
    42431: { message: "Attach reclaim gas" },
    42455: { message: "Invalid share" },
    46251: { message: "Attach 0.08 TON" },
    46993: { message: "Beneficiary only" },
    47572: { message: "Decision is final" },
    49505: { message: "Canonical wallet only" },
    54626: { message: "Task expired" },
    58169: { message: "Invalid task budget" },
    58271: { message: "Wrong network" },
    58979: { message: "Attach report gas" },
    63350: { message: "Canonical share only" },
} as const

export const GstdTaskEscrow_errors_backward = {
    "Stack underflow": 2,
    "Stack overflow": 3,
    "Integer overflow": 4,
    "Integer out of expected range": 5,
    "Invalid opcode": 6,
    "Type check error": 7,
    "Cell overflow": 8,
    "Cell underflow": 9,
    "Dictionary error": 10,
    "'Unknown' error": 11,
    "Fatal error": 12,
    "Out of gas error": 13,
    "Virtualization error": 14,
    "Action list is invalid": 32,
    "Action list is too long": 33,
    "Action is invalid or not supported": 34,
    "Invalid source address in outbound message": 35,
    "Invalid destination address in outbound message": 36,
    "Not enough Toncoin": 37,
    "Not enough extra currencies": 38,
    "Outbound message does not fit into a cell after rewriting": 39,
    "Cannot process a message": 40,
    "Library reference is null": 41,
    "Library change action error": 42,
    "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
    "Account state size exceeded limits": 50,
    "Null reference exception": 128,
    "Invalid serialization prefix": 129,
    "Invalid incoming message": 130,
    "Constraints error": 131,
    "Access denied": 132,
    "Contract stopped": 133,
    "Invalid argument": 134,
    "Code of a contract was not found": 135,
    "Invalid standard address": 136,
    "Not a basechain address": 138,
    "Share not funded": 4210,
    "Noncanonical wallet code": 4541,
    "Invalid phase": 5572,
    "Zero amount": 7189,
    "Task not fully funded": 9774,
    "Accepted work cannot be refunded": 11455,
    "Refund not authorized": 14348,
    "Invalid role": 19397,
    "Task not accepted": 21450,
    "Task still active": 21757,
    "Already refunded": 22411,
    "Canonical GSTD only": 22752,
    "Payer only": 29534,
    "Coordinator only": 34197,
    "Basechain only": 35367,
    "Zero recipient": 35820,
    "Attach 0.30 TON sync budget": 40025,
    "Attach reclaim gas": 42431,
    "Invalid share": 42455,
    "Attach 0.08 TON": 46251,
    "Beneficiary only": 46993,
    "Decision is final": 47572,
    "Canonical wallet only": 49505,
    "Task expired": 54626,
    "Invalid task budget": 58169,
    "Wrong network": 58271,
    "Attach report gas": 58979,
    "Canonical share only": 63350,
} as const

const GstdTaskEscrow_types: ABIType[] = [
    {"name":"DataSize","header":null,"fields":[{"name":"cells","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bits","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"refs","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"SignedBundle","header":null,"fields":[{"name":"signature","type":{"kind":"simple","type":"fixed-bytes","optional":false,"format":64}},{"name":"signedData","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"StateInit","header":null,"fields":[{"name":"code","type":{"kind":"simple","type":"cell","optional":false}},{"name":"data","type":{"kind":"simple","type":"cell","optional":false}}]},
    {"name":"Context","header":null,"fields":[{"name":"bounceable","type":{"kind":"simple","type":"bool","optional":false}},{"name":"sender","type":{"kind":"simple","type":"address","optional":false}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"raw","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"SendParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"code","type":{"kind":"simple","type":"cell","optional":true}},{"name":"data","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"MessageParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"DeployParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}},{"name":"init","type":{"kind":"simple","type":"StateInit","optional":false}}]},
    {"name":"StdAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":8}},{"name":"address","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"VarAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"address","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"BasechainAddress","header":null,"fields":[{"name":"hash","type":{"kind":"simple","type":"int","optional":true,"format":257}}]},
    {"name":"Deploy","header":2490013878,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"DeployOk","header":2952335191,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"FactoryDeploy","header":1829761339,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"cashback","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"AcceptFundedTask","header":1196705025,"fields":[]},
    {"name":"WithdrawAcceptedShare","header":1196705026,"fields":[{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"RefundExpiredShare","header":1196705027,"fields":[{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"SyncTask","header":1196705028,"fields":[]},
    {"name":"RefundExpiredTask","header":1196705029,"fields":[]},
    {"name":"CommitTask","header":1196705030,"fields":[{"name":"phase","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"FundingReady","header":1196705031,"fields":[{"name":"role","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"ReportFunding","header":1196705032,"fields":[]},
    {"name":"ReclaimEscrowTon","header":1196705033,"fields":[]},
    {"name":"EscrowGstdReceived","header":1935855772,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"from","type":{"kind":"simple","type":"address","optional":false}},{"name":"forwardPayload","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"EscrowExcess","header":3576854235,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"GstdEscrowShare$Data","header":null,"fields":[{"name":"coordinator","type":{"kind":"simple","type":"address","optional":false}},{"name":"payer","type":{"kind":"simple","type":"address","optional":false}},{"name":"beneficiary","type":{"kind":"simple","type":"address","optional":false}},{"name":"role","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"requiredAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"walletCode","type":{"kind":"simple","type":"cell","optional":false}},{"name":"master","type":{"kind":"simple","type":"address","optional":false}},{"name":"network","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"funded","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"phase","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"GstdTaskEscrow$Data","header":null,"fields":[{"name":"payer","type":{"kind":"simple","type":"address","optional":false}},{"name":"worker","type":{"kind":"simple","type":"address","optional":false}},{"name":"protocol","type":{"kind":"simple","type":"address","optional":false}},{"name":"reserve","type":{"kind":"simple","type":"address","optional":false}},{"name":"taskId","type":{"kind":"simple","type":"uint","optional":false,"format":256}},{"name":"budget","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"deadline","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"walletCode","type":{"kind":"simple","type":"cell","optional":false}},{"name":"master","type":{"kind":"simple","type":"address","optional":false}},{"name":"network","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"phase","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"readyMask","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
]

const GstdTaskEscrow_opcodes = {
    "Deploy": 2490013878,
    "DeployOk": 2952335191,
    "FactoryDeploy": 1829761339,
    "AcceptFundedTask": 1196705025,
    "WithdrawAcceptedShare": 1196705026,
    "RefundExpiredShare": 1196705027,
    "SyncTask": 1196705028,
    "RefundExpiredTask": 1196705029,
    "CommitTask": 1196705030,
    "FundingReady": 1196705031,
    "ReportFunding": 1196705032,
    "ReclaimEscrowTon": 1196705033,
    "EscrowGstdReceived": 1935855772,
    "EscrowExcess": 3576854235,
}

const GstdTaskEscrow_getters: ABIGetter[] = [
    {"name":"state","methodId":77589,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"funding_mask","methodId":90642,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"share_address","methodId":107043,"arguments":[{"name":"role","type":{"kind":"simple","type":"int","optional":false,"format":257}}],"returnType":{"kind":"simple","type":"address","optional":false}},
    {"name":"share_amount","methodId":109428,"arguments":[{"name":"role","type":{"kind":"simple","type":"int","optional":false,"format":257}}],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
]

export const GstdTaskEscrow_getterMapping: { [key: string]: string } = {
    'state': 'getState',
    'funding_mask': 'getFundingMask',
    'share_address': 'getShareAddress',
    'share_amount': 'getShareAmount',
}

const GstdTaskEscrow_receivers: ABIReceiver[] = [
    {"receiver":"internal","message":{"kind":"typed","type":"SyncTask"}},
    {"receiver":"internal","message":{"kind":"typed","type":"FundingReady"}},
    {"receiver":"internal","message":{"kind":"typed","type":"AcceptFundedTask"}},
    {"receiver":"internal","message":{"kind":"typed","type":"RefundExpiredTask"}},
    {"receiver":"internal","message":{"kind":"typed","type":"ReclaimEscrowTon"}},
    {"receiver":"internal","message":{"kind":"typed","type":"EscrowExcess"}},
    {"receiver":"internal","message":{"kind":"empty"}},
    {"receiver":"internal","message":{"kind":"typed","type":"Deploy"}},
]


export class GstdTaskEscrow implements Contract {
    
    public static readonly storageReserve = 0n;
    public static readonly errors = GstdTaskEscrow_errors_backward;
    public static readonly opcodes = GstdTaskEscrow_opcodes;
    
    static async init(payer: Address, worker: Address, protocol: Address, reserve: Address, taskId: bigint, budget: bigint, deadline: bigint, walletCode: Cell, master: Address, network: bigint) {
        return await GstdTaskEscrow_init(payer, worker, protocol, reserve, taskId, budget, deadline, walletCode, master, network);
    }
    
    static async fromInit(payer: Address, worker: Address, protocol: Address, reserve: Address, taskId: bigint, budget: bigint, deadline: bigint, walletCode: Cell, master: Address, network: bigint) {
        const __gen_init = await GstdTaskEscrow_init(payer, worker, protocol, reserve, taskId, budget, deadline, walletCode, master, network);
        const address = contractAddress(0, __gen_init);
        return new GstdTaskEscrow(address, __gen_init);
    }
    
    static fromAddress(address: Address) {
        return new GstdTaskEscrow(address);
    }
    
    readonly address: Address; 
    readonly init?: { code: Cell, data: Cell };
    readonly abi: ContractABI = {
        types:  GstdTaskEscrow_types,
        getters: GstdTaskEscrow_getters,
        receivers: GstdTaskEscrow_receivers,
        errors: GstdTaskEscrow_errors,
    };
    
    constructor(address: Address, init?: { code: Cell, data: Cell }) {
        this.address = address;
        this.init = init;
    }
    
    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean| null | undefined }, message: SyncTask | FundingReady | AcceptFundedTask | RefundExpiredTask | ReclaimEscrowTon | EscrowExcess | null | Deploy) {
        
        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SyncTask') {
            body = beginCell().store(storeSyncTask(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'FundingReady') {
            body = beginCell().store(storeFundingReady(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'AcceptFundedTask') {
            body = beginCell().store(storeAcceptFundedTask(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'RefundExpiredTask') {
            body = beginCell().store(storeRefundExpiredTask(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ReclaimEscrowTon') {
            body = beginCell().store(storeReclaimEscrowTon(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'EscrowExcess') {
            body = beginCell().store(storeEscrowExcess(message)).endCell();
        }
        if (message === null) {
            body = new Cell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Deploy') {
            body = beginCell().store(storeDeploy(message)).endCell();
        }
        if (body === null) { throw new Error('Invalid message type'); }
        
        await provider.internal(via, { ...args, body: body });
        
    }
    
    async getState(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('state', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }
    
    async getFundingMask(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('funding_mask', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }
    
    async getShareAddress(provider: ContractProvider, role: bigint) {
        const builder = new TupleBuilder();
        builder.writeNumber(role);
        const source = (await provider.get('share_address', builder.build())).stack;
        const result = source.readAddress();
        return result;
    }
    
    async getShareAmount(provider: ContractProvider, role: bigint) {
        const builder = new TupleBuilder();
        builder.writeNumber(role);
        const source = (await provider.get('share_amount', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }
    
}