# Смарт-контракт TON

## Структура контракта

### Хранилище
```func
() store_data = (
    owner: MsgAddress;                    // Владелец контракта
    tasks: dictionary;                    // Словарь заданий
    escrows: dictionary;                  // Словарь escrow
    requesters: dictionary;               // Словарь заказчиков
    devices: dictionary;                  // Словарь устройств
    whitelist_operations: dictionary;    // Whitelist операций
    whitelist_models: dictionary;         // Whitelist моделей
    total_tasks: int;                     // Всего заданий
    total_ton_distributed: Coins;         // Всего TON распределено
);
```

### Сообщения

#### create_task
Создание задания заказчиком

```func
() recv_internal(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body) impure {
    if (in_msg_body.slice_empty?()) { return (); }
    
    int op = in_msg_body~load_uint(32);
    
    if (op == 1) { ;; create_task
        slice requester = in_msg_body~load_msg_addr();
        int task_type = in_msg_body~load_uint(8);
        slice operation = in_msg_body~load_ref();
        slice model = in_msg_body~load_ref();
        slice input_hash = in_msg_body~load_ref();
        int time_limit = in_msg_body~load_uint(32);
        int max_energy = in_msg_body~load_uint(32);
        int reward_amount = in_msg_body~load_coins();
        int validation_method = in_msg_body~load_uint(8);
        
        ;; Проверка наличия GSTD токена на кошельке
        int gstd_balance = get_gstd_balance(requester);
        if (gstd_balance < min_gstd_required) { throw(101); }
        
        ;; Проверка whitelist
        var op_data = whitelist_operations.get(operation);
        if (op_data == null) { throw(102); }
        
        ;; Создание задания
        int task_id = total_tasks;
        total_tasks += 1;
        
        cell task_data = begin_cell()
            .store_slice(requester)
            .store_uint(task_type, 8)
            .store_ref(operation)
            .store_ref(model)
            .store_ref(input_hash)
            .store_uint(time_limit, 32)
            .store_uint(max_energy, 32)
            .store_coins(reward_amount)
            .store_uint(validation_method, 8)
            .store_uint(0, 8) ;; status: pending
            .store_uint(now(), 64) ;; created_at
            .end_cell();
        
        tasks~set(task_id, task_data);
        
        ;; Создание escrow
        cell escrow_data = begin_cell()
            .store_coins(reward_amount)
            .store_uint(0, 1) ;; locked
            .end_cell();
        
        escrows~set(task_id, escrow_data);
    }
}
```

#### deposit_escrow
Внесение TON в escrow

```func
if (op == 2) { ;; deposit_escrow
    int task_id = in_msg_body~load_uint(64);
    int amount = in_msg_body~load_coins();
    
    var escrow_data = escrows.get(task_id);
    if (escrow_data == null) { throw(200); }
    
    int current_amount = escrow_data~load_coins();
    int locked = escrow_data~load_uint(1);
    
    if (locked == 1) { throw(201); } ;; Уже заблокирован
    
    escrow_data = begin_cell()
        .store_coins(current_amount + amount)
        .store_uint(0, 1)
        .end_cell();
    
    escrows~set(task_id, escrow_data);
}
```

#### execute_payment
Выполнение выплаты

```func
if (op == 3) { ;; execute_payment
    int task_id = in_msg_body~load_uint(64);
    slice device_address = in_msg_body~load_msg_addr();
    int amount = in_msg_body~load_coins();
    slice validation_proof = in_msg_body~load_ref();
    
    ;; Проверка задания
    var task_data = tasks.get(task_id);
    if (task_data == null) { throw(300); }
    
    int status = task_data~load_uint(8);
    if (status != 2) { throw(301); } ;; Должно быть validated
    
    ;; Проверка escrow
    var escrow_data = escrows.get(task_id);
    if (escrow_data == null) { throw(302); }
    
    int escrow_amount = escrow_data~load_coins();
    if (escrow_amount < amount) { throw(303); }
    
    ;; Проверка подписи сервера
    slice server_signature = in_msg_body~load_ref();
    if (~ check_server_signature(validation_proof, server_signature)) {
        throw(304);
    }
    
    ;; Выплата
    escrow_amount -= amount;
    escrow_data = begin_cell()
        .store_coins(escrow_amount)
        .store_uint(1, 1) ;; locked
        .end_cell();
    
    escrows~set(task_id, escrow_data);
    
    ;; Отправка TON устройству
    send_raw_message(
        begin_cell()
            .store_uint(0x18, 6)
            .store_slice(device_address)
            .store_coins(amount)
            .store_uint(0, 1 + 4 + 4 + 64 + 32 + 2 + 1)
            .store_ref(validation_proof)
            .end_cell(),
        1
    );
    
    ;; Обновление статистики
    total_ton_distributed += amount;
    
    ;; Обновление статуса задания
    task_data = begin_cell()
        .store_slice(task_data~load_msg_addr())
        .store_uint(task_data~load_uint(8), 8)
        .store_ref(task_data~load_ref())
        .store_ref(task_data~load_ref())
        .store_ref(task_data~load_ref())
        .store_uint(task_data~load_uint(32), 32)
        .store_uint(task_data~load_uint(32), 32)
        .store_coins(task_data~load_coins())
        .store_uint(task_data~load_uint(8), 8)
        .store_uint(3, 8) ;; status: completed
        .store_uint(task_data~load_uint(64), 64)
        .end_cell();
    
    tasks~set(task_id, task_data);
}
```

#### stake_gstd
Стейкинг GSTD

```func
if (op == 4) { ;; stake_gstd
    slice requester = in_msg_body~load_msg_addr();
    int amount = in_msg_body~load_coins();
    
    var requester_data = requesters.get(requester);
    int current_stake = 0;
    
    if (requester_data != null) {
        current_stake = requester_data~load_coins();
    }
    
    requester_data = begin_cell()
        .store_coins(current_stake + amount)
        .store_uint(now(), 64)
        .end_cell();
    
    requesters~set(requester, requester_data);
}
```

#### update_device_reputation
Обновление репутации устройства

```func
if (op == 5) { ;; update_device_reputation
    slice device_address = in_msg_body~load_msg_addr();
    int reputation_score = in_msg_body~load_uint(32); ;; 0-10000 (0.0000-1.0000)
    int total_tasks = in_msg_body~load_uint(32);
    int successful_tasks = in_msg_body~load_uint(32);
    
    cell device_data = begin_cell()
        .store_uint(reputation_score, 32)
        .store_uint(total_tasks, 32)
        .store_uint(successful_tasks, 32)
        .store_uint(now(), 64)
        .end_cell();
    
    devices~set(device_address, device_data);
}
```

## Геттеры

### get_task
```func
(int, cell) get_task(int task_id) method_id {
    var task_data = tasks.get(task_id);
    if (task_data == null) {
        return (-1, null());
    }
    return (0, task_data);
}
```

### get_escrow
```func
(int, int) get_escrow(int task_id) method_id {
    var escrow_data = escrows.get(task_id);
    if (escrow_data == null) {
        return (-1, 0);
    }
    int amount = escrow_data~load_coins();
    return (0, amount);
}
```

### get_gstd_balance
```func
(int, int) get_gstd_balance(slice requester) method_id {
    ;; Проверка баланса GSTD токена на кошельке через Jetton Wallet
    int balance = get_jetton_balance(requester, GSTD_JETTON_ADDRESS);
    return (0, balance);
}
```

### get_device_reputation
```func
(int, int) get_device_reputation(slice device_address) method_id {
    var device_data = devices.get(device_address);
    if (device_data == null) {
        return (-1, 0);
    }
    int reputation = device_data~load_uint(32);
    return (0, reputation);
}
```

## Безопасность

### Проверка подписи сервера
```func
int check_server_signature(slice message, slice signature) inline {
    ;; Проверка подписи сервера
    ;; В реальной реализации используется криптографическая проверка
    return 1; ;; Упрощённо
}
```

### Минимальные значения
```func
const min_gstd_required = 1000000000; ;; 1 GSTD (в нано) - минимальный баланс для участия
const min_reward = 10000000;  ;; 0.01 TON (в нано)
```

## События

Все важные события логируются в блокчейне:
- Создание задания
- Внесение в escrow
- Выполнение выплаты
- Обновление репутации
- Slashing

