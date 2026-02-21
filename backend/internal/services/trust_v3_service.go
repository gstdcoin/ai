package services

import (
	"context"
	"database/sql"
	"math"
	"time"
)

const (
	DecayLambda = 0.00001 // Коэффициент затухания доверия (медленный)
	AlphaTrust  = 0.1     // Вес нового действия
)

// TrustV3Service реализует многомерную модель доверия
type TrustV3Service struct {
	db *sql.DB
}

func NewTrustV3Service(db *sql.DB) *TrustV3Service {
	return &TrustV3Service{db: db}
}

// UpdateTrustVector обновляет вектор доверия устройства {A, L, S}
func (s *TrustV3Service) UpdateTrustVector(ctx context.Context, deviceID string, accuracy, latency, stability float64) error {
	var curA, curL, curS float64
	var lastUpdate time.Time

	err := s.db.QueryRowContext(ctx, `
		SELECT accuracy_score, latency_score, stability_score, COALESCE(last_reputation_update, NOW()) 
		FROM devices WHERE device_id = $1
	`, deviceID).Scan(&curA, &curL, &curS, &lastUpdate)
	if err != nil {
		return err
	}

	// 1. Применяем Time Decay (затухание если долго не было активности)
	dt := time.Since(lastUpdate).Seconds()
	decay := math.Exp(-DecayLambda * dt)

	// 2. Обновляем вектор с учетом новых данных и затухания
	newA := (curA*decay*(1-AlphaTrust) + accuracy*AlphaTrust)
	newL := (curL*decay*(1-AlphaTrust) + latency*AlphaTrust)
	newS := (curS*decay*(1-AlphaTrust) + stability*AlphaTrust)

	// 3. Сохраняем и обновляем глобальный Trust Score как среднее векторов
	globalTrust := (newA*0.6 + newL*0.2 + newS*0.2)

	_, err = s.db.ExecContext(ctx, `
		UPDATE devices 
		SET accuracy_score = $1, latency_score = $2, stability_score = $3, 
		    trust_score = $4, last_reputation_update = NOW()
		WHERE device_id = $5
	`, newA, newL, newS, globalTrust, deviceID)

	return err
}

