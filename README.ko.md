# @ilokesto/queryable

공유 Symbol 메서드로 레코드를 조회하고, 순서가 있는 시퀀스와 선택적 지연 평가를 조합합니다.

![Public npm target](https://img.shields.io/badge/status-public_npm_target-555?style=flat)

[문서](./docs/index.ko.mdx) | [API](./docs/index.ko.mdx#연산) | [English](./README.md)

- **조합 가능한 쿼리** — 필터, 정렬, 변환, 그룹화를 연결합니다.
- **명시적인 순서** — 시퀀스가 비교 함수의 정렬 순서를 보존합니다.
- **필요할 때 지연 평가** — 조기 종료 탐색을 지원하며 런타임 의존성이 없습니다.

## 로컬 설정

**npm 공개 배포 대상, 버전 0.0.1.** 이 저장소 안에서 실행하며, 저장소 간 workspace 링크는 지원하지 않습니다. 로컬 문서 사이트는 `next` 채널만 다룹니다.

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

## 더 알아보기

- [연산과 계약](./docs/index.ko.mdx#연산)
- [순서와 마이그레이션](./docs/index.ko.mdx#레코드시퀀스와-마이그레이션)
- [지연 평가](./docs/index.ko.mdx#지연-평가-계약)
- [벤치마크 방법](./bench/README.md)과 [실측 결과](./bench/RESULTS.md)

<details>
<summary>개발</summary>

이 저장소에서 Node 24(`.nvmrc` 참고)와 pnpm 10.17.1을 사용합니다.

```sh
pnpm typecheck
pnpm test
pnpm test:tooling
pnpm docs:publication:verify
pnpm docs:typecheck
pnpm docs:build
pnpm docs:test
pnpm bench
```

main 머지는 Changesets 릴리스 PR을 생성·갱신합니다. 해당 PR을 머지하면 성공한 Verify의 정확한 산출물만 배포하며, 로컬 배포는 금지합니다. 조직 공용 `NPM_TOKEN`에 이 저장소의 접근 권한을 설정하세요. 벤치마크는 정확성 판정이 아닌 측정이며, Remeda는 비교용 개발 의존성입니다.

</details>

Ayden의 [Proxy와 프로토타입 메모리 실험](https://ayden94.com/posts/memory-cost-proxy-and-prototype)을 기반으로 합니다.
