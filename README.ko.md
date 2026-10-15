# @ilokesto/queryable

**0.0.1 · 비공개 베타.** 공유 Symbol 메서드, 순서를 보장하는 시퀀스, 선택적 지연 평가를 제공하는 레코드 쿼리 DSL입니다. 런타임 의존성은 없습니다.

`private: true`를 유지하며 npm 배포 목록과 공개 문서 사이트에는 등록하지 않았습니다. 다른 워크스페이스에서 사용하려면 의존성에 `"@ilokesto/queryable": "workspace:*"`를 추가하고 빌드하세요.

```ts
import { createQueryable, WHERE, SORT, LIMIT, MAP, VALUES } from "@ilokesto/queryable";

const users = createQueryable({
  alice: { name: "Alice", age: 25 },
  bob: { name: "Bob", age: 30 },
  charlie: { name: "Charlie", age: 20 },
});
const names = users[WHERE](user => user.age >= 25)
  [SORT]((a, b) => b.age - a.age)[LIMIT](2)[MAP](user => user.name)[VALUES]();
// ["Bob", "Alice"]
```

## 연산

| 연산 | 결과 |
| --- | --- |
| `[WHERE]((value, key) => boolean)` | 필터 결과; 타입 가드를 받으면 값 타입도 좁힘 |
| `[SORT]((a, b) => number)` | 숫자형 키도 비교 순서를 보장하는 안정 정렬 `QuerySequence` |
| `[MAP]((value, key) => next)` | 키를 유지한 값 변환 |
| `[PICK](...keys)` | 지정한 레코드 키의 값 전체; 없는 키·중복 키는 무시 |
| `[LIMIT](n)` | `slice(0, n)` 의미 |
| `[GROUP_BY]((value, key) => K)` | 즉시 계산한 그룹; 키 리터럴을 보존하는 `Partial<Record<K, ...>>` |
| `[COUNT]()` | 개수 |
| `[FIRST]()` | 첫 값 또는 `undefined` |
| `[VALUES]()` | 순서대로 담은 새 값 배열 |
| `[FIND]((value, key) => boolean)` | 첫 일치 값 또는 `undefined`; 타입 가드 지원 |
| `[SOME]((value, key) => boolean)` | 첫 일치에서 종료하는 boolean 결과 |
| `[ENTRIES]()` | 순서대로 담은 새 `[key, value]` 튜플 배열 |
| `[TO_OBJECT]()` | 쿼리 메서드 없는 일반 객체 |
| `[REDUCE]((acc, value, key) => next, initial)` | 순서대로 누적; 초기값 필수 |
| `[LAZY]()` | 반복 소비 가능한 비메모이제이션 지연 시퀀스 |

## 레코드·시퀀스와 마이그레이션

`createQueryable`은 수정 가능한 `Queryable<T>` 레코드를 반환합니다. 즉시 실행하는 `WHERE`, `MAP`, `PICK`, `LIMIT`은 새 레코드를 만듭니다. `SORT`는 숫자형 키가 다시 정렬되는 문제를 피하도록 `QuerySequence<T>`를 반환하며, 후속 변환도 시퀀스를 유지합니다.

```ts
import { createQueryable, SORT, LIMIT, ENTRIES, TO_OBJECT } from "@ilokesto/queryable";

const sorted = createQueryable({ 1: 10, 2: 20 })[SORT]((a, b) => b - a);
sorted[LIMIT](1)[ENTRIES](); // [["2", 20]]
sorted[TO_OBJECT](); // 일반 객체에서는 숫자 키가 다시 "1", "2" 순서로 열거됨
```

시퀀스 데이터는 `VALUES`·`ENTRIES`·`TO_OBJECT`로 꺼내세요. 직접 키 조회, spread, JSON 직렬화를 데이터 추출 용도로 쓰지 않습니다.

이번 비공개 베타에서 **`SELECT`를 제거하고 `PICK`으로 이름을 변경**했습니다. import와 호출 이름을 바꾸세요. `PICK("alice")`는 값 내부 필드가 아닌 레코드 키를 고릅니다. 필드 추출은 `MAP(user => ({ name: user.name }))`으로 표현합니다. 레코드 PICK의 삽입 순서는 인자 순서지만 숫자 키에는 객체 열거 규칙이 적용됩니다. 시퀀스 PICK은 인자 순서를 그대로 보존합니다.

## 지연 평가 계약

```ts
import { createQueryable, LAZY, WHERE, MAP, LIMIT, VALUES } from "@ilokesto/queryable";

const query = createQueryable({ a: 1, b: 2, c: 3, d: 4 });
const firstEven = query[LAZY]()[WHERE](n => n % 2 === 0)
  [MAP](n => n * 10)[LIMIT](1);
firstEven[VALUES](); // [20]; predicate에는 a와 b만 전달됨
```

- 기본 연산은 호출 즉시 실행합니다. `LAZY` 이후 `WHERE`, `MAP`, `PICK`, `LIMIT`, `SORT`는 소비 시점까지 미룹니다.
- `VALUES`, `ENTRIES`, `TO_OBJECT`, `COUNT`, `REDUCE`, `FIRST`, `FIND`, `SOME`, `GROUP_BY`는 남은 연산을 실행합니다. `FIRST`, `FIND`, `SOME`, 비음수 `LIMIT`은 앞선 순회를 조기 종료합니다. `LIMIT(0)`은 원본도 읽지 않습니다.
- `SORT`, 시퀀스 `PICK`, 유한한 음수 `LIMIT`은 전체 입력이 필요하므로 소비할 때 버퍼링합니다. `GROUP_BY`는 호출 즉시 전체를 읽어 즉시 평가 그룹을 만듭니다. 레코드의 그룹은 레코드, 시퀀스의 그룹은 시퀀스입니다.
- 매번 소비할 때 새로 순회하고 미뤄 둔 콜백을 다시 실행합니다. 캐시는 없습니다. 예외는 소비 시점에 전파되며, 다음 소비는 처음부터 다시 시도합니다.
- 레코드의 지연 뷰는 소비 시점의 **쿼리 레코드**를 읽습니다. 소비 사이에 쿼리를 수정하면 반영됩니다. 생성 전 원본 객체는 이미 얕게 복사했으므로 원본의 속성 교체는 반영되지 않습니다. 정렬된 즉시 평가 시퀀스는 스냅샷이며, 나중에 `LAZY`를 붙여도 이미 실행한 정렬은 다시 실행하지 않습니다.
- 중첩 값은 참조를 공유합니다. 콜백에서 순회 중인 소스 레코드의 키를 추가·삭제하거나 값을 교체하지 마세요. 순회 중 변경에 대한 스냅샷 격리는 제공하지 않습니다.

단일 탐색에는 `FIND`·`SOME`을 쓰세요. 기본 모드의 `WHERE(predicate)[FIRST]()`는 여전히 필터 결과 전체를 먼저 만듭니다.

## 타입과 집계

```ts
import { createQueryable, WHERE, GROUP_BY, REDUCE } from "@ilokesto/queryable";

const mixed = createQueryable<number | string>({ a: 1, b: "two" });
const strings = mixed[WHERE]((value): value is string => typeof value === "string");
// Queryable<string>
const groups = createQueryable({ a: 1, b: 2, c: 3 })
  [GROUP_BY](n => n % 2 ? "odd" : "even");
const oddTotal = groups.odd?.[REDUCE]((sum, n) => sum + n, 0); // 4
```

가능한 그룹 키라도 실제 데이터에는 없을 수 있으므로 optional로 표현합니다. 빈 쿼리의 `REDUCE`는 초기값을 그대로 반환합니다.

## 공통 계약

- 자기 소유의 열거 가능한 문자열 키만 복사합니다. 상속·비열거·Symbol 키는 제외합니다. `__proto__`, `constructor`, `toString`도 일반 데이터 키입니다.
- 생성과 변환은 얕은 복사이며 입력을 변경하지 않습니다.
- `LIMIT`은 소수 절삭, 음수로 뒤쪽 제외, `NaN`은 빈 결과, `Infinity`는 전체라는 `slice` 의미를 유지합니다.
- 메서드는 receiver가 필요합니다. 구조 분해로 떼어 호출하지 마세요. 레코드의 spread·JSON은 데이터만 남기고 메서드는 잃습니다.
- 메서드를 공유하고 동결하지만 특정 메모리 절감률·속도 우위를 보장하지 않습니다.

## 개발·벤치마크

```sh
pnpm --filter @ilokesto/queryable typecheck
pnpm --filter @ilokesto/queryable test
pnpm --filter @ilokesto/queryable build
pnpm --filter @ilokesto/queryable bench
```

[측정 방법](./bench/README.md)과 [실측 결과](./bench/RESULTS.md)를 참고하세요. Remeda는 비교용 개발 의존성일 뿐 런타임 의존성이 아닙니다.

Ayden의 [Proxy와 프로토타입 메모리 실험](https://ayden94.com/posts/memory-cost-proxy-and-prototype) 하단 구현을 기반으로 정렬·타입·조기 종료·지연 평가를 보강했습니다.

[English](./README.md)
