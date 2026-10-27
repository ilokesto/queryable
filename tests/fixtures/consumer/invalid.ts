import {
  GROUP_BY, LAZY, LIMIT, MAP, REDUCE, VALUES, WHERE, createQueryable,
} from "@ilokesto/queryable";

const query = createQueryable({ a: 1 });
const values = query[VALUES];
values();
const map = query[MAP];
map(String);
query[VALUES].call({});
query[LIMIT]("1");
query[WHERE](() => 1);
query[GROUP_BY](() => 1);
query[REDUCE]((_accumulator, value) => String(value), 0);
query[LAZY]().a;
const readonly = createQueryable({ a: { count: 1 } } as const);
if (readonly.a) { readonly.a.count = 2; }
