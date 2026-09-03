# Strategy Plugin + Engine + Composite Modules

## 1. Strategy Plugin Module

### 1.1 Định nghĩa

Strategy Plugin Module là nơi tập trung định nghĩa tất cả các strategy. Các strategy này được đóng gói dưới dạng các plugin riêng biệt và được quản lý thông qua một lớp trung tâm gọi là StrategyRegistry. StrategyRegistry hoạt động như một kho lưu trữ đăng ký, cho phép các service khác trong hệ thống truy vấn và sử dụng các strategy có sẵn mà không cần biết chi tiết cách chúng được triển khai.

### 1.2 Cách hoạt động

Khi ứng dụng khởi động, module StrategyPluginModule được NestJS khởi tạo và tự động inject tất cả các strategy mà developer đã khai báo vào trong StrategyRegistry. Các strategy này bao gồm những strategy được xây dựng sẵn (built-in) cũng như những strategy do AI tạo ra (AI-generated).

Các service bên ngoài module sẽ gọi tới StrategyRegistry để:
* Lấy danh sách các strategy có sẵn
* Kiểm tra sự tồn tại của một strategy cụ thể
* Truy xuất một strategy theo tên hoặc loại để sử dụng trong các tác vụ khác

Nhờ cơ chế này, việc thêm một strategy mới chỉ cần đăng ký plugin mà không phải sửa đổi các service khác, giúp hệ thống dễ mở rộng và bảo trì.

## 2. Strategy Engine Module

### 2.1 Định nghĩa

Strategy Engine Module là động cơ chính của hệ thống strategy. Module này chịu trách nhiệm thực thi các strategy, nhưng không định nghĩa strategy là gì. Thay vào đó, nó nhận đầu vào là một strategy (lấy từ Strategy Plugin Module) kết hợp với dữ liệu cần thiết, sau đó gọi thực thi strategy đó và trả ra kết quả.

### 2.2 Cách hoạt động

Strategy Engine Module hoạt động theo mô hình nhà cung cấp nhiên liệu: nó yêu cầu bạn cung cấp đủ "nhiên liệu" (strategy + dữ liệu) để có thể khởi động. Khi có đủ thông tin, engine sẽ gọi StrategyRegistry từ Plugin Module để lấy strategy tương ứng, sau đó thực thi nó.

Quá trình này xảy ra mỗi khi:
* Có yêu cầu phân tích tín hiệu thị trường từ Frontend hoặc từ các quy trình khác
* Engine nhận thông tin về một candidate member và context của nó
* Engine gọi strategy phù hợp để phát sinh một tín hiệu (BUY, SELL, hoặc HOLD)

Engine không chứa logic của bất kỳ strategy nào, nó chỉ là lớp trung gian điều phối việc gọi thực thi.

## 3. Strategy Composite Module

### 3.1 Định nghĩa

Strategy Composite Module là nơi kết hợp tín hiệu từ nhiều strategy để đưa ra quyết định duy nhất. Khi nhiều strategy phát sinh những tín hiệu khác nhau (BUY, SELL, HOLD), module này sẽ dựa vào trọng số mà người dùng cài đặt cho từng strategy để tổng hợp thành một giá trị duy nhất, từ đó so sánh với các ngưỡng được xác định trước để đưa ra quyết định cuối cùng.

### 3.2 Cách hoạt động

Strategy Composite Module hoạt động theo các bước sau:

1. Nhận dạng strategy loại nào được áp dụng bằng cách đọc thuộc tính "type" của CandidateMember (thông tin này đến từ Strategy Search Module)

2. Gọi Strategy Engine Service để thực thi mỗi strategy và nhận về tín hiệu tương ứng (mỗi tín hiệu đại diện cho một khuyến nghị BUY, SELL, hoặc HOLD)

3. Tính toán giá trị tổng hợp bằng công thức:
   ```
   score = Σ(w × signal) / Σw
   ```
   trong đó w là trọng số của mỗi strategy và signal là tín hiệu từ strategy đó

4. So sánh giá trị tổng hợp này với các ngưỡng được cài đặt sẵn (từ Strategy Search Module) để quyết định hành động cuối cùng: BUY nếu vượt ngưỡng trên, SELL nếu dưới ngưỡng dưới, hoặc HOLD nếu nằm giữa

Cơ chế trọng số cho phép người dùng kiểm soát mức độ ảnh hưởng của từng strategy vào quyết định cuối cùng, giúp tinh chỉnh chiến lược theo nhu cầu riêng.

## 4. Tổng kết - Mối liên hệ giữa 3 module

Ba module Strategy Plugin, Strategy Engine, và Strategy Composite tạo thành một hệ thống phân tầng để quản lý và thực thi strategy:

* **Strategy Plugin Module** là tầng kho lưu trữ, cung cấp tất cả strategy có sẵn thông qua StrategyRegistry
* **Strategy Engine Module** là tầng thực thi, nhận strategy từ Plugin Module và dữ liệu từ các nguồn khác, rồi thực thi nó
* **Strategy Composite Module** là tầng quyết định, gọi Engine Module để lấy tín hiệu từ nhiều strategy, sau đó kết hợp chúng lại thành một quyết định duy nhất dựa trên trọng số

Ngoài ra, Composite Module cũng phụ thuộc vào Strategy Search Module để lấy thông tin về CandidateMember (bao gồm type của strategy và các ngưỡng cần thiết) nhằm xác định strategy nào cần được thực thi và những điều kiện nào sẽ được áp dụng cho quyết định cuối cùng.

Luồng dữ liệu chính là: Plugin cung cấp → Engine thực thi → Composite tổng hợp → Quyết định cuối cùng.