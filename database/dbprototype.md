| Technology             | Vai trò                | Dữ liệu                                                |
| ---------------------- | ---------------------- | ------------------------------------------------------ |
| **PostgreSQL**         | Primary DB             | Strategy, Experiment, Backtest, Trade |
| **TimescaleDB**        | Time-series extension  | OHLCV, candles, historical market data                 |
| **Redis**              | Cache + realtime state | Price hiện tại, candle hiện tại, Top-K, job status     |
| **RabbitMQ**           | Job queue              | Backtest jobs, strategy search jobs                    |
| **MongoDB**           | Job queue              | Backtest jobs, strategy search jobs                    |