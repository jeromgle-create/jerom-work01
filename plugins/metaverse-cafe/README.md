# metaverse-cafe 플러그인

Three.js 로우폴리 메타버스 카페 키트를 Claude Code 스킬로 담은 플러그인입니다. 자세한 내용은 `skills/metaverse-cafe/SKILL.md`를 보세요.

## 설치 (컴퓨터마다 한 번)

```
/plugin marketplace add jeromgle-create/jerom-work01
/plugin install metaverse-cafe@jerom-skills
```

설치 후에는 모든 프로젝트에서 "메타버스 카페 이어서 작업해줘"처럼 말하면 자동으로 불러오고, `/metaverse-cafe:metaverse-cafe`로 직접 부를 수도 있습니다.

## 특정 프로젝트에서 자동 설치

그 프로젝트의 `.claude/settings.json`에 아래를 넣고 커밋하면, 그 저장소를 여는 사람에게 설치를 제안합니다(클라우드 세션 포함).

```json
{
  "extraKnownMarketplaces": {
    "jerom-skills": { "source": { "source": "github", "repo": "jeromgle-create/jerom-work01" } }
  },
  "enabledPlugins": { "metaverse-cafe@jerom-skills": true }
}
```

## 업데이트

스킬을 고친 뒤 `plugin.json`과 `marketplace.json`의 `version`을 올리고 푸시하면, 설치한 쪽에서 `/plugin update metaverse-cafe@jerom-skills`로 받습니다.
