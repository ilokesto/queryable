# @ilokesto/queryable

공유 Symbol 메서드로 레코드를 조회하고, 순서가 있는 시퀀스와 선택적 지연 평가를 조합합니다.

![Public npm target](https://img.shields.io/badge/status-public_npm_target-555?style=flat)

[English](./README.md)

- **조합 가능한 쿼리** — 필터, 정렬, 변환, 그룹화를 연결합니다.
- **명시적인 순서** — 시퀀스가 비교 함수의 정렬 순서를 보존합니다.
- **필요할 때 지연 평가** — 조기 종료 탐색을 지원하며 런타임 의존성이 없습니다.

## 로컬 설정

이 저장소 안에서 실행하며, 저장소 간 workspace 링크는 지원하지 않습니다.

```sh
pnpm install --frozen-lockfile
pnpm build
```

## 빠른 시작

```ts
import { createQueryable, WHERE, SORT, LIMIT, MAP, VALUES } from "@ilokesto/queryable";

const users = createQueryable({
  alice: { name: "Alice", age: 25 },
  bob: { name: "Bob", age: 30 },
  charlie: { name: "Charlie", age: 20 },
});

const names = users
  [WHERE](user => user.age >= 25)
  [SORT]((a, b) => b.age - a.age)
  [LIMIT](2)
  [MAP](user => user.name)
  [VALUES](); // ["Bob", "Alice"]
```

`PICK`은 값 내부 필드가 아닌 레코드 키를 선택합니다. `SORT` 이후에는 `VALUES`나 `ENTRIES`로 순서를 보존하세요. 지연 뷰는 소비할 때마다 다시 실행하며, 값은 얕은 참조를 공유합니다.

레코드는 네이티브 객체 키 순서를 따릅니다. `LAZY`는 메모이제이션 없이
소비할 때마다 생성된 쿼리 레코드를 다시 읽습니다. 정렬과 유한 음수 제한은
upstream을 버퍼링할 수 있고 그룹화는 즉시 실행됩니다.

선택한 own enumerable 키의 얕은 읽기 전용 스냅샷에는
`createShapeQueryable(input, whitelist)`를 사용하세요. 비동기 입력은
`createAsyncQuerySequence`에 소비마다 새 iterator를 제공하고, signal을
외부 작업에 전달하며 iterator 정리 단계에서 자원을 해제하세요.

## 더 알아보기

- [실행 가능한 이행 예제](./tests/consumer/migration-example.ts)
- [연산 예제](./tests/consumer/family-examples.ts)
- [벤치마크 방법](./bench/README.md)과 [실측 결과](./bench/RESULTS.md)

<details>
<summary>개발</summary>

이 저장소에서 Node 24(`.nvmrc` 참고)와 pnpm 10.17.1을 사용합니다.

```sh
pnpm typecheck
pnpm test
pnpm test:tooling
pnpm bench
```

main 머지는 Changesets 릴리스 PR을 생성·갱신합니다. 해당 PR을 머지하면 성공한 Verify의 정확한 산출물만 배포하며, 로컬 배포는 금지합니다. 조직 공용 `NPM_TOKEN`에 이 저장소의 접근 권한을 설정하세요. 벤치마크는 정확성 판정이 아닌 측정이며, Remeda는 비교용 개발 의존성입니다.

</details>

Ayden의 [Proxy와 프로토타입 메모리 실험](https://ayden94.com/posts/memory-cost-proxy-and-prototype)을 기반으로 합니다.
