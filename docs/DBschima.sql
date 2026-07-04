# 서비스에 가입한 유저 정보 저장
users (
  id              bigint primary key, # 유저를 구분하는 고유 번호
  username        varchar(20) unique not null, # 유저가 로그인할 때 쓰는 이름
  password_hash   varchar(255) not null, # 비밀번호의 해시값
  created_at      timestamp not null # 회원가입한 시간
)

# 왁뿌볼 자체의 3D 모델 데이터를 저장하는 테이블
wakppuball_models (
  id                  bigint primary key, # 왁뿌볼 모델의 고유 번호
  creator_user_id     bigint references users(id), # 이 왁뿌볼을 처음 만든 유저의 users.id
  name                varchar(50), # 왁뿌볼 이름
  model_url           text, # 3D 모델 파일의 위치
  thumbnail_url       text, # 컬렉션에서 보여줄 미리보기 이미지
  customization_json  json, # 왁뿌볼의 커스텀 정보를 저장하는 JSON
  fracture_json       json, # 미리 쪼개진 조각, 금 텍스처 등 깨짐 연출 프리셋
  default_break_count int default 3, # 새로 보유할 때 부여되는 기본 뿌시기 가능 횟수
  created_at          timestamp not null # 왁뿌볼이 생성된 시간
)

# 어떤 유저가 어떤 왁뿌볼을 보유하고 있는지 저장하는 테이블
user_wakppuballs (
  id                  bigint primary key, # 보유 기록의 고유 번호
  owner_user_id       bigint references users(id), # 현재 이 왁뿌볼을 보유한 유저의 users.id
  wakppuball_model_id bigint references wakppuball_models(id), # 보유 중인 왁뿌볼 모델의 id, 원본 모델을 가리킴
  acquired_type       varchar(20), # 이 왁뿌볼을 어떻게 얻었는지?
  acquired_from_user_id bigint references users(id), # 누구에게서 받았는지
  is_main             boolean default false, # 메인 화면에 띄울 대표 왁뿌볼인지 여부
  remaining_break_count int default 3, # 앞으로 뿌실 수 있는 남은 횟수
  status              varchar(20) default 'ACTIVE', # ACTIVE: 보유 중, CONSUMED: 소멸됨
  acquired_at         timestamp not null, # 이 왁뿌볼을 얻은 시간
  consumed_at         timestamp # 카운트 0 이후 상호작용 영역에서 내려가거나 접속 종료되어 소멸된 시간
)

# 매칭과 교환 기록을 저장하는 테이블
match_history (
  id bigint primary key, # 매칭 기록의 고유 번호
  user_a_id bigint references users(id), # 매칭에 참여한 첫 번째 유저
  user_b_id bigint references users(id), # 매칭에 참여한 두 번째 유저
  user_a_sent_wakppuball_id bigint references user_wakppuballs(id), # A가 B에게 보낸 보유 왁뿌볼
  user_b_sent_wakppuball_id bigint references user_wakppuballs(id), # B가 A에게 보낸 보유 왁뿌볼
  matched_at timestamp not null # 매칭이 완료된 시간
)
