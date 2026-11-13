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

export type ReturnAcceptedSurplus = {
    $$type: 'ReturnAcceptedSurplus';
    amount: bigint;
    queryId: bigint;
}

export function storeReturnAcceptedSurplus(src: ReturnAcceptedSurplus) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1196705034, 32);
        b_0.storeCoins(src.amount);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadReturnAcceptedSurplus(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1196705034) { throw Error('Invalid prefix'); }
    const _amount = sc_0.loadCoins();
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'ReturnAcceptedSurplus' as const, amount: _amount, queryId: _queryId };
}

export function loadTupleReturnAcceptedSurplus(source: TupleReader) {
    const _amount = source.readBigNumber();
    const _queryId = source.readBigNumber();
    return { $$type: 'ReturnAcceptedSurplus' as const, amount: _amount, queryId: _queryId };
}

export function loadGetterTupleReturnAcceptedSurplus(source: TupleReader) {
    const _amount = source.readBigNumber();
    const _queryId = source.readBigNumber();
    return { $$type: 'ReturnAcceptedSurplus' as const, amount: _amount, queryId: _queryId };
}

export function storeTupleReturnAcceptedSurplus(source: ReturnAcceptedSurplus) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.amount);
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserReturnAcceptedSurplus(): DictionaryValue<ReturnAcceptedSurplus> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeReturnAcceptedSurplus(src)).endCell());
        },
        parse: (src) => {
            return loadReturnAcceptedSurplus(src.loadRef().beginParse());
        }
    }
}

export type ShareTokenTransfer = {
    $$type: 'ShareTokenTransfer';
    queryId: bigint;
    amount: bigint;
    recipient: Address;
    response: Address;
    customPayload: Cell | null;
    forwardAmount: bigint;
    forwardPayload: Slice;
}

export function storeShareTokenTransfer(src: ShareTokenTransfer) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(260734629, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.recipient);
        b_0.storeAddress(src.response);
        if (src.customPayload !== null && src.customPayload !== undefined) { b_0.storeBit(true).storeRef(src.customPayload); } else { b_0.storeBit(false); }
        b_0.storeCoins(src.forwardAmount);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export function loadShareTokenTransfer(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 260734629) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _recipient = sc_0.loadAddress();
    const _response = sc_0.loadAddress();
    const _customPayload = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _forwardAmount = sc_0.loadCoins();
    const _forwardPayload = sc_0;
    return { $$type: 'ShareTokenTransfer' as const, queryId: _queryId, amount: _amount, recipient: _recipient, response: _response, customPayload: _customPayload, forwardAmount: _forwardAmount, forwardPayload: _forwardPayload };
}

export function loadTupleShareTokenTransfer(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _recipient = source.readAddress();
    const _response = source.readAddress();
    const _customPayload = source.readCellOpt();
    const _forwardAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'ShareTokenTransfer' as const, queryId: _queryId, amount: _amount, recipient: _recipient, response: _response, customPayload: _customPayload, forwardAmount: _forwardAmount, forwardPayload: _forwardPayload };
}

export function loadGetterTupleShareTokenTransfer(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _recipient = source.readAddress();
    const _response = source.readAddress();
    const _customPayload = source.readCellOpt();
    const _forwardAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'ShareTokenTransfer' as const, queryId: _queryId, amount: _amount, recipient: _recipient, response: _response, customPayload: _customPayload, forwardAmount: _forwardAmount, forwardPayload: _forwardPayload };
}

export function storeTupleShareTokenTransfer(source: ShareTokenTransfer) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeAddress(source.recipient);
    builder.writeAddress(source.response);
    builder.writeCell(source.customPayload);
    builder.writeNumber(source.forwardAmount);
    builder.writeSlice(source.forwardPayload.asCell());
    return builder.build();
}

export function dictValueParserShareTokenTransfer(): DictionaryValue<ShareTokenTransfer> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeShareTokenTransfer(src)).endCell());
        },
        parse: (src) => {
            return loadShareTokenTransfer(src.loadRef().beginParse());
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

export type GstdEscrowShareV2$Data = {
    $$type: 'GstdEscrowShareV2$Data';
    coordinator: Address;
    payer: Address;
    beneficiary: Address;
    role: bigint;
    requiredAmount: bigint;
    walletCode: Cell;
    master: Address;
    network: bigint;
    funded: bigint;
    beneficiaryDebited: bigint;
    surplusDebited: bigint;
    transferPending: bigint;
    transferQuery: bigint;
    transferAmount: bigint;
    phase: bigint;
}

export function storeGstdEscrowShareV2$Data(src: GstdEscrowShareV2$Data) {
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
        b_1.storeCoins(src.beneficiaryDebited);
        b_1.storeCoins(src.surplusDebited);
        b_1.storeUint(src.transferPending, 8);
        b_1.storeUint(src.transferQuery, 64);
        b_1.storeCoins(src.transferAmount);
        b_1.storeUint(src.phase, 8);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadGstdEscrowShareV2$Data(slice: Slice) {
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
    const _beneficiaryDebited = sc_1.loadCoins();
    const _surplusDebited = sc_1.loadCoins();
    const _transferPending = sc_1.loadUintBig(8);
    const _transferQuery = sc_1.loadUintBig(64);
    const _transferAmount = sc_1.loadCoins();
    const _phase = sc_1.loadUintBig(8);
    return { $$type: 'GstdEscrowShareV2$Data' as const, coordinator: _coordinator, payer: _payer, beneficiary: _beneficiary, role: _role, requiredAmount: _requiredAmount, walletCode: _walletCode, master: _master, network: _network, funded: _funded, beneficiaryDebited: _beneficiaryDebited, surplusDebited: _surplusDebited, transferPending: _transferPending, transferQuery: _transferQuery, transferAmount: _transferAmount, phase: _phase };
}

export function loadTupleGstdEscrowShareV2$Data(source: TupleReader) {
    const _coordinator = source.readAddress();
    const _payer = source.readAddress();
    const _beneficiary = source.readAddress();
    const _role = source.readBigNumber();
    const _requiredAmount = source.readBigNumber();
    const _walletCode = source.readCell();
    const _master = source.readAddress();
    const _network = source.readBigNumber();
    const _funded = source.readBigNumber();
    const _beneficiaryDebited = source.readBigNumber();
    const _surplusDebited = source.readBigNumber();
    const _transferPending = source.readBigNumber();
    const _transferQuery = source.readBigNumber();
    const _transferAmount = source.readBigNumber();
    const _phase = source.readBigNumber();
    return { $$type: 'GstdEscrowShareV2$Data' as const, coordinator: _coordinator, payer: _payer, beneficiary: _beneficiary, role: _role, requiredAmount: _requiredAmount, walletCode: _walletCode, master: _master, network: _network, funded: _funded, beneficiaryDebited: _beneficiaryDebited, surplusDebited: _surplusDebited, transferPending: _transferPending, transferQuery: _transferQuery, transferAmount: _transferAmount, phase: _phase };
}

export function loadGetterTupleGstdEscrowShareV2$Data(source: TupleReader) {
    const _coordinator = source.readAddress();
    const _payer = source.readAddress();
    const _beneficiary = source.readAddress();
    const _role = source.readBigNumber();
    const _requiredAmount = source.readBigNumber();
    const _walletCode = source.readCell();
    const _master = source.readAddress();
    const _network = source.readBigNumber();
    const _funded = source.readBigNumber();
    const _beneficiaryDebited = source.readBigNumber();
    const _surplusDebited = source.readBigNumber();
    const _transferPending = source.readBigNumber();
    const _transferQuery = source.readBigNumber();
    const _transferAmount = source.readBigNumber();
    const _phase = source.readBigNumber();
    return { $$type: 'GstdEscrowShareV2$Data' as const, coordinator: _coordinator, payer: _payer, beneficiary: _beneficiary, role: _role, requiredAmount: _requiredAmount, walletCode: _walletCode, master: _master, network: _network, funded: _funded, beneficiaryDebited: _beneficiaryDebited, surplusDebited: _surplusDebited, transferPending: _transferPending, transferQuery: _transferQuery, transferAmount: _transferAmount, phase: _phase };
}

export function storeTupleGstdEscrowShareV2$Data(source: GstdEscrowShareV2$Data) {
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
    builder.writeNumber(source.beneficiaryDebited);
    builder.writeNumber(source.surplusDebited);
    builder.writeNumber(source.transferPending);
    builder.writeNumber(source.transferQuery);
    builder.writeNumber(source.transferAmount);
    builder.writeNumber(source.phase);
    return builder.build();
}

export function dictValueParserGstdEscrowShareV2$Data(): DictionaryValue<GstdEscrowShareV2$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeGstdEscrowShareV2$Data(src)).endCell());
        },
        parse: (src) => {
            return loadGstdEscrowShareV2$Data(src.loadRef().beginParse());
        }
    }
}

export type GstdTaskEscrowV2$Data = {
    $$type: 'GstdTaskEscrowV2$Data';
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

export function storeGstdTaskEscrowV2$Data(src: GstdTaskEscrowV2$Data) {
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

export function loadGstdTaskEscrowV2$Data(slice: Slice) {
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
    return { $$type: 'GstdTaskEscrowV2$Data' as const, payer: _payer, worker: _worker, protocol: _protocol, reserve: _reserve, taskId: _taskId, budget: _budget, deadline: _deadline, walletCode: _walletCode, master: _master, network: _network, phase: _phase, readyMask: _readyMask };
}

export function loadTupleGstdTaskEscrowV2$Data(source: TupleReader) {
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
    return { $$type: 'GstdTaskEscrowV2$Data' as const, payer: _payer, worker: _worker, protocol: _protocol, reserve: _reserve, taskId: _taskId, budget: _budget, deadline: _deadline, walletCode: _walletCode, master: _master, network: _network, phase: _phase, readyMask: _readyMask };
}

export function loadGetterTupleGstdTaskEscrowV2$Data(source: TupleReader) {
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
    return { $$type: 'GstdTaskEscrowV2$Data' as const, payer: _payer, worker: _worker, protocol: _protocol, reserve: _reserve, taskId: _taskId, budget: _budget, deadline: _deadline, walletCode: _walletCode, master: _master, network: _network, phase: _phase, readyMask: _readyMask };
}

export function storeTupleGstdTaskEscrowV2$Data(source: GstdTaskEscrowV2$Data) {
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

export function dictValueParserGstdTaskEscrowV2$Data(): DictionaryValue<GstdTaskEscrowV2$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeGstdTaskEscrowV2$Data(src)).endCell());
        },
        parse: (src) => {
            return loadGstdTaskEscrowV2$Data(src.loadRef().beginParse());
        }
    }
}

 type GstdEscrowShareV2_init_args = {
    $$type: 'GstdEscrowShareV2_init_args';
    coordinator: Address;
    payer: Address;
    beneficiary: Address;
    role: bigint;
    requiredAmount: bigint;
    walletCode: Cell;
    master: Address;
    network: bigint;
}

function initGstdEscrowShareV2_init_args(src: GstdEscrowShareV2_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.coordinator);
        b_0.storeAddress(src.payer);
        b_0.storeAddress(src.beneficiary);
        const b_1 = new Builder();
        b_1.storeInt(src.role, 257);
        b_1.storeInt(src.requiredAmount, 257);
        b_1.storeRef(src.walletCode);
        b_1.storeAddress(src.master);
        const b_2 = new Builder();
        b_2.storeInt(src.network, 257);
        b_1.storeRef(b_2.endCell());
        b_0.storeRef(b_1.endCell());
    };
}

async function GstdEscrowShareV2_init(coordinator: Address, payer: Address, beneficiary: Address, role: bigint, requiredAmount: bigint, walletCode: Cell, master: Address, network: bigint) {
    const __code = Cell.fromBoc(Buffer.from('b5ee9c7241022a01000ad6000114ff00f4a413f4bcf2c80b01020162021502f6d001d072d721d200d200fa4021103450666f04f86102f862ed44d0d200018e2ffa40fa40fa40d307fa00d4d401d0fa40d21ffa00fa00fa00d307d33ffa00d30730109f109e109d109c109b109a6c1f8ea9fa40fa40fa40d401d0810101d700810101d700d4fa40d430d0810101d7003010581057105608d15506e22603049a11108e9d0e8020d7217021d749c21f9430d31f01de82100f8a7ea5bae3025f0f30e0702fd74920c21f96310fd31f1110de2182107362d09cbae30221821047544508bae30221821047544506ba0406070902fcd33ffa005932813737f8420e11100e5e3c10bf0a11100a109f08111008107f06111006105f04111004103f02111002011111011112db3c01111301c70501111101f2f421c3009351eeba923e70e29351ceba923c70e28e130bc00193500ca19550aca1090be270541ccc0bde10ae109d108c107b106a10591048103746142205006e5052c87f01ca0055e050efce1cce1ace18cb075006fa0214cc02c8ceca1f58fa0258fa0258fa0212cb0712cb3f58fa0212cb07cdc9ed5403ee5b0ed33f31fa00308200c161f84210ef10df10cf10bf10af109f108f107f106f105f104f103f102f011110011111db3c01111201c70501111001f2f4504da05307be8e9e10be10ad109c108b107a10691058104746165045db3c4cde49ab46784545de10be10ad109c108b107a1069105810474616504522081201a05b3e8200e663f8416f24135f038209c9c380bef2f410ce551bdb3cc87f01ca0055e050efce1cce1ace18cb075006fa0214cc02c8ceca1f58fa0258fa0258fa0212cb0712cb3f58fa0212cb07cdc9ed540800b2811072537bbef2f482084c4b40717f2ec80182104754450758cb1fcb07c95612553010246d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0003fc8e5f5b0ed3073082008595f8422fc705f2f48115c421c103f2f42f992f8200b9d402baf2f4913fe210ce551bc87f01ca0055e050efce1cce1ace18cb075006fa0214cc02c8ceca1f58fa0258fa0258fa0212cb0712cb3f58fa0212cb07cdc9ed54e021821047544502bae3022182104754450abae30221821047544503ba0a0b0c02b45f030dfa00308200b791f8422cc705f2f48153ca2fc001f2f48200a7ca02c0009320c2009170e2955330a029bb9170e212f2f4710da454411422a010df2b10df0e10bd10ac109b108a107910681710465415024515504403db3c0d1202ae5f030dfa003081735ef8422dc705f2f48153ca2fc001f2f4813c5002c0009320c2009170e2975382a021a025bb9170e212f2f4720da454411322a010df2c0f10ce10bd10ac109b108a107910680554167205414403db3c0d1203fc8ef05b0efa00d33f3081735ef8422fc705f2f481380c5611c002f2f40e11100e2d111010df10ce10bd10ac109b108a107910681057104610354444db3cc87f01ca0055e050efce1cce1ace18cb075006fa0214cc02c8ceca1f58fa0258fa0258fa0212cb0712cb3f58fa0212cb07cdc9ed54e021821047544509bae302210d101102ee811c1522c200f2f48200b4abf8416f24135f03821004c4b400bef2f4f8276f10f8416f24135f03a1208209312d00b996308209312d00de72fb020e11110e0d11100d10cf0b11110b0a11100a109f0811110807111007106f0511110504111004103f02111102011110010fdb3c820afaf080717f7070c8220e01f282100f8a7ea501cb1f01111601cb3f011116fa02011116cf16f828cf1601111301ca005612fa0201111301ca00c91403111203021111020111130110246d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00f84270810082700f0072136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb00552b01d05b3e81735ef8422dc705f2f48200a5bff8416f24135f038209c9c380bef2f48209312d0072fb022b7081008270136d6d50436d03c8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0010ce551b1203fc8210d53276dbba8ee95b0ed33f3022c3009221ba923070e28e533d5290c002923029de70c870fa0258cf1626cf16ca00c95260705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d0811f14f84258c705f2f470520dde10ce551be05710c0000fc1211fb0e302121314006ac87f01ca0055e050efce1cce1ace18cb075006fa0214cc02c8ceca1f58fa0258fa0258fa0212cb0712cb3f58fa0212cb07cdc9ed54007210ce551bc87f01ca0055e050efce1cce1ace18cb075006fa0214cc02c8ceca1f58fa0258fa0258fa0212cb0712cb3f58fa0212cb07cdc9ed54000a5f0ff2c082020120161e020120171c020120181a02d3b542dda89a1a400031c5ff481f481f481a60ff401a9a803a1f481a43ff401f401f401a60fa67ff401a60e60213e213c213a213821362134d83f1d53f481f481f481a803a1020203ae01020203ae01a9f481a861a1020203ae006020b020ae20ac11a2aa0dc5b678d9e30261900022602d3b5e2bda89a1a400031c5ff481f481f481a60ff401a9a803a1f481a43ff401f401f401a60fa67ff401a60e60213e213c213a213821362134d83f1d53f481f481f481a803a1020203ae01020203ae01a9f481a861a1020203ae006020b020ae20ac11a2aa0dc5b678d9e30261b00022002d3ba78aed44d0d200018e2ffa40fa40fa40d307fa00d4d401d0fa40d21ffa00fa00fa00d307d33ffa00d30730109f109e109d109c109b109a6c1f8ea9fa40fa40fa40d401d0810101d700810101d700d4fa40d430d0810101d7003010581057105608d15506e2db3c6cf18261d0002230201201f25020162202302d3af4476a268690000c717fd207d207d206983fd006a6a00e87d20690ffd007d007d006983e99ffd00698398084f884f084e884e084d884d360fc754fd207d207d206a00e8408080eb80408080eb806a7d206a1868408080eb8018082c082b882b0468aa83716d9e3678c026210104db3c22007c70c870fa02f828cf162acf16ca00c952a0705920f90022f9005ad76501d76582020134c8cb17cb0fcb0fcbffcbff71f90400c87401cb0212ca07cbffc9d002d3ac2576a268690000c717fd207d207d206983fd006a6a00e87d20690ffd007d007d006983e99ffd00698398084f884f084e884e084d884d360fc754fd207d207d206a00e8408080eb80408080eb806a7d206a1868408080eb8018082c082b882b0468aa83716d9e3678c02624000653a5a102d3bb0eded44d0d200018e2ffa40fa40fa40d307fa00d4d401d0fa40d21ffa00fa00fa00d307d33ffa00d30730109f109e109d109c109b109a6c1f8ea9fa40fa40fa40d401d0810101d700810101d700d4fa40d430d0810101d7003010581057105608d15506e2db3c6cf18262902e68200a5d725c2ff9325c1039170e29324c2009170e2f2f48111bd23f90082f0a46ef8746f4ea669c2ce9455be129b693cd1c638cb021faaac58c7df01e0a163baf2f48200e39f8013f833d08020db3c22ba9c2181ff11ba917f9321c0fde29170e2f2f42081ff11bae30070547000547000550427280006d70030005a8158e08d0860077f4e30b7b39b11519bb9b84be07d000c6a443eb030faca8ccc2f9fdfdedacd945230c705f2f4001070537ba126a1b609f43e26b4', 'hex'))[0];
    const builder = beginCell();
    builder.storeUint(0, 1);
    initGstdEscrowShareV2_init_args({ $$type: 'GstdEscrowShareV2_init_args', coordinator, payer, beneficiary, role, requiredAmount, walletCode, master, network })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

export const GstdEscrowShareV2_errors = {
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
    7956: { message: "Canonical destination only" },
    9774: { message: "Task not fully funded" },
    11455: { message: "Accepted work cannot be refunded" },
    14135: { message: "Canonical source only" },
    14348: { message: "Refund not authorized" },
    15440: { message: "Surplus exceeded or transfer pending" },
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
    42954: { message: "Beneficiary entitlement exceeded or transfer pending" },
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

export const GstdEscrowShareV2_errors_backward = {
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
    "Canonical destination only": 7956,
    "Task not fully funded": 9774,
    "Accepted work cannot be refunded": 11455,
    "Canonical source only": 14135,
    "Refund not authorized": 14348,
    "Surplus exceeded or transfer pending": 15440,
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
    "Beneficiary entitlement exceeded or transfer pending": 42954,
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

const GstdEscrowShareV2_types: ABIType[] = [
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
    {"name":"ReturnAcceptedSurplus","header":1196705034,"fields":[{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"ShareTokenTransfer","header":260734629,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"recipient","type":{"kind":"simple","type":"address","optional":false}},{"name":"response","type":{"kind":"simple","type":"address","optional":false}},{"name":"customPayload","type":{"kind":"simple","type":"cell","optional":true}},{"name":"forwardAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"forwardPayload","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"EscrowGstdReceived","header":1935855772,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"from","type":{"kind":"simple","type":"address","optional":false}},{"name":"forwardPayload","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"EscrowExcess","header":3576854235,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"GstdEscrowShareV2$Data","header":null,"fields":[{"name":"coordinator","type":{"kind":"simple","type":"address","optional":false}},{"name":"payer","type":{"kind":"simple","type":"address","optional":false}},{"name":"beneficiary","type":{"kind":"simple","type":"address","optional":false}},{"name":"role","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"requiredAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"walletCode","type":{"kind":"simple","type":"cell","optional":false}},{"name":"master","type":{"kind":"simple","type":"address","optional":false}},{"name":"network","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"funded","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"beneficiaryDebited","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"surplusDebited","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"transferPending","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"transferQuery","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"transferAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"phase","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"GstdTaskEscrowV2$Data","header":null,"fields":[{"name":"payer","type":{"kind":"simple","type":"address","optional":false}},{"name":"worker","type":{"kind":"simple","type":"address","optional":false}},{"name":"protocol","type":{"kind":"simple","type":"address","optional":false}},{"name":"reserve","type":{"kind":"simple","type":"address","optional":false}},{"name":"taskId","type":{"kind":"simple","type":"uint","optional":false,"format":256}},{"name":"budget","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"deadline","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"walletCode","type":{"kind":"simple","type":"cell","optional":false}},{"name":"master","type":{"kind":"simple","type":"address","optional":false}},{"name":"network","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"phase","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"readyMask","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
]

const GstdEscrowShareV2_opcodes = {
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
    "ReturnAcceptedSurplus": 1196705034,
    "ShareTokenTransfer": 260734629,
    "EscrowGstdReceived": 1935855772,
    "EscrowExcess": 3576854235,
}

const GstdEscrowShareV2_getters: ABIGetter[] = [
    {"name":"beneficiary_remaining","methodId":100426,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"payer_surplus","methodId":127213,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"transfer_pending","methodId":92042,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"state","methodId":77589,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"credited_funding","methodId":68118,"arguments":[],"returnType":{"kind":"simple","type":"int","optional":false,"format":257}},
    {"name":"jetton_wallet_address","methodId":99976,"arguments":[],"returnType":{"kind":"simple","type":"address","optional":false}},
]

export const GstdEscrowShareV2_getterMapping: { [key: string]: string } = {
    'beneficiary_remaining': 'getBeneficiaryRemaining',
    'payer_surplus': 'getPayerSurplus',
    'transfer_pending': 'getTransferPending',
    'state': 'getState',
    'credited_funding': 'getCreditedFunding',
    'jetton_wallet_address': 'getJettonWalletAddress',
}

const GstdEscrowShareV2_receivers: ABIReceiver[] = [
    {"receiver":"internal","message":{"kind":"typed","type":"EscrowGstdReceived"}},
    {"receiver":"internal","message":{"kind":"typed","type":"ReportFunding"}},
    {"receiver":"internal","message":{"kind":"typed","type":"CommitTask"}},
    {"receiver":"internal","message":{"kind":"typed","type":"WithdrawAcceptedShare"}},
    {"receiver":"internal","message":{"kind":"typed","type":"ReturnAcceptedSurplus"}},
    {"receiver":"internal","message":{"kind":"typed","type":"RefundExpiredShare"}},
    {"receiver":"internal","message":{"kind":"typed","type":"ReclaimEscrowTon"}},
    {"receiver":"internal","message":{"kind":"typed","type":"EscrowExcess"}},
    {"receiver":"internal","message":{"kind":"empty"}},
]


export class GstdEscrowShareV2 implements Contract {

    public static readonly storageReserve = 0n;
    public static readonly errors = GstdEscrowShareV2_errors_backward;
    public static readonly opcodes = GstdEscrowShareV2_opcodes;

    static async init(coordinator: Address, payer: Address, beneficiary: Address, role: bigint, requiredAmount: bigint, walletCode: Cell, master: Address, network: bigint) {
        return await GstdEscrowShareV2_init(coordinator, payer, beneficiary, role, requiredAmount, walletCode, master, network);
    }

    static async fromInit(coordinator: Address, payer: Address, beneficiary: Address, role: bigint, requiredAmount: bigint, walletCode: Cell, master: Address, network: bigint) {
        const __gen_init = await GstdEscrowShareV2_init(coordinator, payer, beneficiary, role, requiredAmount, walletCode, master, network);
        const address = contractAddress(0, __gen_init);
        return new GstdEscrowShareV2(address, __gen_init);
    }

    static fromAddress(address: Address) {
        return new GstdEscrowShareV2(address);
    }

    readonly address: Address;
    readonly init?: { code: Cell, data: Cell };
    readonly abi: ContractABI = {
        types:  GstdEscrowShareV2_types,
        getters: GstdEscrowShareV2_getters,
        receivers: GstdEscrowShareV2_receivers,
        errors: GstdEscrowShareV2_errors,
    };

    constructor(address: Address, init?: { code: Cell, data: Cell }) {
        this.address = address;
        this.init = init;
    }

    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean| null | undefined }, message: EscrowGstdReceived | ReportFunding | CommitTask | WithdrawAcceptedShare | ReturnAcceptedSurplus | RefundExpiredShare | ReclaimEscrowTon | EscrowExcess | null) {

        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'EscrowGstdReceived') {
            body = beginCell().store(storeEscrowGstdReceived(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ReportFunding') {
            body = beginCell().store(storeReportFunding(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'CommitTask') {
            body = beginCell().store(storeCommitTask(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'WithdrawAcceptedShare') {
            body = beginCell().store(storeWithdrawAcceptedShare(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'ReturnAcceptedSurplus') {
            body = beginCell().store(storeReturnAcceptedSurplus(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'RefundExpiredShare') {
            body = beginCell().store(storeRefundExpiredShare(message)).endCell();
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
        if (body === null) { throw new Error('Invalid message type'); }

        await provider.internal(via, { ...args, body: body });

    }

    async getBeneficiaryRemaining(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('beneficiary_remaining', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }

    async getPayerSurplus(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('payer_surplus', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }

    async getTransferPending(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('transfer_pending', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }

    async getState(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('state', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }

    async getCreditedFunding(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('credited_funding', builder.build())).stack;
        const result = source.readBigNumber();
        return result;
    }

    async getJettonWalletAddress(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('jetton_wallet_address', builder.build())).stack;
        const result = source.readAddress();
        return result;
    }

}