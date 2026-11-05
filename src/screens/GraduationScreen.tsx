/**
 * 🎓 畢業門檻:把課表裡匯入的北科課程,對照入學年度的課程標準,算出各類學分進度。
 *
 * 資料流:
 *   課表(CourseEntry,含類別符號)+ 畢業計畫(GraduationPlan:課程標準、手動調整)
 *   → services/graduation.computeGraduation → 這裡只負責呈現與收使用者的調整。
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../store/AppContext';
import { ManualCredit } from '../types';
import { colors, radius, spacing } from '../theme';
import { notify } from '../utils/dialog';
import { Button, Card, Chip, SectionTitle } from '../components/ui';
import { ProgressBar, TypeBadge } from '../components/CreditProgress';
import ImportCourseModal, { ImportResult } from '../components/ImportCourseModal';
import GraduationSetupModal from '../components/GraduationSetupModal';
import CourseAdjustModal from '../components/CourseAdjustModal';
import ManualCreditModal from '../components/ManualCreditModal';
import {
  ClassifiedCourse,
  computeGraduation,
  defaultPlan,
  groupRequiredByTerm,
} from '../services/graduation';
import { backfillCourseMeta, fetchSemesterCourses } from '../services/ntutCourse';
import { CATEGORY_COLORS, CATEGORY_LABELS, CREDIT_KEYS } from '../constants/ntut';

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const GraduationScreen: React.FC = () => {
  const { data, saveGraduationPlan, updateCourses } = useApp();
  const [owner, setOwner] = useState(data.users[0]?.id ?? 'u1');
  const ownerName = data.users.find((u) => u.id === owner)?.name ?? '';

  const plan = useMemo(
    () => data.graduation.find((g) => g.ownerId === owner) ?? defaultPlan(owner),
    [data.graduation, owner]
  );
  const summary = useMemo(() => computeGraduation(plan, data.courses), [plan, data.courses]);
  const std = plan.standard;

  const [setupOpen, setSetupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<ClassifiedCourse | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [editingManual, setEditingManual] = useState<ManualCredit | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  /** 課程依學期分組(summary.courses 已依學期新→舊排序) */
  const bySemester = useMemo(() => {
    const groups: { semesterId: string; items: ClassifiedCourse[] }[] = [];
    for (const c of summary.courses) {
      const key = c.semesterId ?? '未分類';
      const last = groups[groups.length - 1];
      if (last && last.semesterId === key) last.items.push(c);
      else groups.push({ semesterId: key, items: [c] });
    }
    return groups;
  }, [summary.courses]);

  const requiredGroups = useMemo(
    () => groupRequiredByTerm(summary.requiredCourses),
    [summary.requiredCourses]
  );
  const requiredDone = summary.requiredCourses.filter((r) => r.done).length;

  const handleImported = (r: ImportResult) => {
    const n = new Set(r.entries.map((e) => e.ntutCourseId ?? e.title)).size;
    notify('匯入完成', `${r.semester.id} 匯入 ${n} 門課,已納入畢業學分計算(課表頁也會看到)。`);
  };

  /** 補齊舊匯入課程缺少的類別符號:每個學期下載一次課程總表 */
  const backfill = async () => {
    const targets = data.courses.filter(
      (c) => c.ownerId === owner && c.source === 'ntut' && c.ntutCourseId && !c.ntutCourseType
    );
    const semesterIds = [...new Set(targets.map((c) => c.semesterId).filter(Boolean))] as string[];
    if (!semesterIds.length) return notify('沒有需要補齊的課程');
    setBackfilling(true);
    let updatedCount = 0;
    const failed: string[] = [];
    try {
      for (const sid of semesterIds) {
        const [year, sem] = sid.split('-').map(Number);
        if (!year || !sem) continue;
        try {
          const all = await fetchSemesterCourses(year, sem);
          const updated = backfillCourseMeta(targets.filter((c) => c.semesterId === sid), all);
          if (updated.length) updateCourses(updated);
          updatedCount += updated.length;
        } catch (e) {
          failed.push(`${sid}:${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } finally {
      setBackfilling(false);
    }
    notify(
      '補齊完成',
      `更新 ${updatedCount} 筆課程時段的類別資料。` + (failed.length ? `\n\n失敗:\n${failed.join('\n')}` : '')
    );
  };

  const toggleRule = (rule: string) => {
    const checked = plan.checkedRules.includes(rule)
      ? plan.checkedRules.filter((r) => r !== rule)
      : [...plan.checkedRules, rule];
    saveGraduationPlan({ ...plan, checkedRules: checked });
  };

  const saveManual = (item: ManualCredit) => {
    const rest = plan.manualCredits.filter((m) => m.id !== item.id);
    saveGraduationPlan({ ...plan, manualCredits: [...rest, item] });
  };
  const deleteManual = (id: string) => {
    saveGraduationPlan({ ...plan, manualCredits: plan.manualCredits.filter((m) => m.id !== id) });
  };

  const totalColor =
    summary.total.required !== null && summary.total.remaining === 0 ? colors.success : colors.primary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
    >
      {/* 成員切換 + 匯入 */}
      <View style={s.ownerRow}>
        <Text style={s.ownerLabel}>誰的:</Text>
        {data.users.map((u) => (
          <Chip
            key={u.id}
            label={u.name}
            color={u.color}
            active={owner === u.id}
            onPress={() => setOwner(u.id)}
          />
        ))}
        <View style={{ flex: 1 }} />
        <Chip label="⬇ 匯入歷年課表" color={colors.accent} onPress={() => setImportOpen(true)} />
      </View>

      {/* 課程標準 */}
      <Card>
        <SectionTitle>課程標準</SectionTitle>
        {std ? (
          <>
            <Text style={s.stdTitle}>
              {std.entryYear} 學年度入學 · {std.system} · {std.department}
            </Text>
            <Text style={s.hint}>
              最低畢業 {std.credits[CREDIT_KEYS.total] ?? '—'} 學分 · 本系班級前綴:
              {plan.ownClassPrefixes.length ? plan.ownClassPrefixes.join('、') : '未設定'}
              {' · '}
              {new Date(std.fetchedAt).toLocaleDateString()} 下載
            </Text>
            <Button label="更改年度 / 系所 / 重新下載" variant="outline" onPress={() => setSetupOpen(true)} />
          </>
        ) : (
          <>
            <Text style={s.hint}>
              選擇入學學年度與系所後,會從北科課程系統的公開課程標準下載最低畢業學分、各類學分門檻、
              必修科目表與系所規定,再對照「{ownerName}」課表裡匯入的課程計算進度。
            </Text>
            <Button label="選擇入學年度與系所" onPress={() => setSetupOpen(true)} />
          </>
        )}
      </Card>

      {/* 總進度 */}
      <Card>
        <SectionTitle>畢業進度</SectionTitle>
        <View style={s.totalRow}>
          <Text style={[s.totalNum, { color: totalColor }]}>{fmt(summary.total.counted)}</Text>
          <Text style={s.totalDenom}>
            {summary.total.required !== null ? ` / ${summary.total.required} 學分` : ' 學分(無門檻)'}
          </Text>
        </View>
        <ProgressBar value={summary.total.counted} max={summary.total.required} color={totalColor} height={12} />
        <Text style={s.hint}>
          {summary.total.required !== null
            ? summary.total.remaining > 0
              ? `還差 ${fmt(summary.total.remaining)} 學分。`
              : '學分已達最低畢業門檻 🎉(其他規定見下方)。'
            : ''}
          {summary.total.rawEarned !== summary.total.counted
            ? `實際取得 ${fmt(summary.total.rawEarned)} 學分,其中 ${fmt(summary.total.rawEarned - summary.total.counted)} 學分因類別門檻 / 不計入規則未採計。`
            : ''}
        </Text>

        {summary.buckets.map((b) => {
          // 博雅已含在共同必修裡,只在它有自己的門檻時獨立顯示
          if (b.category === 'generalEd' && b.required === null && !showExtra) return null;
          if (b.category === 'commonElective' && b.earned === 0 && !showExtra) return null;
          const color = CATEGORY_COLORS[b.category];
          const done = b.required !== null && b.remaining === 0;
          return (
            <View key={b.category} style={s.bucket}>
              <View style={s.bucketHead}>
                <Text style={s.bucketLabel}>{b.label}</Text>
                <Text style={[s.bucketNum, done && { color: colors.success }]}>
                  {fmt(b.counted)}
                  {b.required !== null ? ` / ${b.required}` : ''}
                  {b.required !== null && b.remaining > 0 ? `(差 ${fmt(b.remaining)})` : ''}
                  {done ? ' ✓' : ''}
                </Text>
              </View>
              <ProgressBar value={b.counted} max={b.required} color={color} height={6} />
              {(b.note || b.overflow > 0 || b.earned !== b.counted) && (
                <Text style={s.bucketNote}>
                  {b.earned !== b.counted ? `取得 ${fmt(b.earned)}` : ''}
                  {b.overflow > 0 ? ` · 超修 ${fmt(b.overflow)} 計入跨域及自由選修` : ''}
                  {b.note ? `${b.earned !== b.counted || b.overflow > 0 ? ' · ' : ''}${b.note}` : ''}
                </Text>
              )}
              {b.category === 'generalEd' && (
                <View style={s.dimRow}>
                  {summary.ge.dimensions
                    .filter((d) => d.designated || d.earned > 0)
                    .map((d) => {
                      const ok = d.required > 0 && d.earned >= d.required;
                      return (
                        <Text
                          key={d.dimension}
                          style={[s.dimChip, ok && s.dimChipOk, !d.designated && s.dimChipFree]}
                        >
                          {d.dimension} {fmt(d.earned)}
                          {d.designated ? `/${d.required}` : ''}
                          {ok ? ' ✓' : ''}
                        </Text>
                      );
                    })}
                </View>
              )}
            </View>
          );
        })}
        <TouchableOpacity onPress={() => setShowExtra(!showExtra)}>
          <Text style={s.link}>{showExtra ? '收合不計入的類別' : '顯示所有類別'}</Text>
        </TouchableOpacity>
      </Card>

      {/* 提醒 */}
      {(summary.warnings.length > 0 || summary.unknownImported > 0) && (
        <Card style={{ borderColor: colors.warning }}>
          <SectionTitle>提醒</SectionTitle>
          {summary.unknownImported > 0 && (
            <>
              <Text style={s.warn}>
                ⚠ {summary.unknownImported} 門先前匯入的課程沒有類別資料(新版才會存),補齊後才會算進進度。
              </Text>
              <Button
                label={backfilling ? '下載課程總表中…' : '補齊課程資料'}
                variant="outline"
                onPress={() => void backfill()}
                disabled={backfilling}
              />
            </>
          )}
          {summary.warnings.map((w) => (
            <Text key={w} style={s.warn}>
              ⚠ {w}
            </Text>
          ))}
        </Card>
      )}

      {/* 必修科目檢核 */}
      {std && (
        <Card>
          <SectionTitle>
            必修科目 {requiredDone} / {summary.requiredCourses.length}
          </SectionTitle>
          <Text style={s.hint}>
            依課程標準逐列核對(分段修習的科目每學期一列)。課名不同但同類的共同必修(英文、體育)會自動認列。
          </Text>
          {requiredGroups.map((g) => {
            const items = showDone ? g.items : g.items.filter((r) => !r.done);
            if (!items.length) return null;
            return (
              <View key={g.term} style={s.termBlock}>
                <Text style={s.termTitle}>
                  {g.term === '其他' ? '其他' : `${g.term.split('-')[0]} 年級 第 ${g.term.split('-')[1]} 學期`}
                </Text>
                {items.map((r, i) => (
                  <View key={`${r.course.name}-${r.course.stage}-${i}`} style={s.reqRow}>
                    <Text style={[s.reqMark, r.done ? s.reqDone : s.reqTodo]}>{r.done ? '✓' : '○'}</Text>
                    <Text style={[s.reqName, r.done && s.reqNameDone]} numberOfLines={2}>
                      {r.course.type} {r.course.name}
                      {r.course.stage !== '1' ? `(${r.course.stage})` : ''}
                      {r.matchedTitle ? `  ← ${r.matchedTitle}` : ''}
                    </Text>
                    <Text style={s.reqCredit}>{fmt(r.course.credit)}</Text>
                  </View>
                ))}
              </View>
            );
          })}
          {requiredDone === summary.requiredCourses.length && summary.requiredCourses.length > 0 && !showDone && (
            <Text style={s.okText}>必修科目都修過了 🎉</Text>
          )}
          <TouchableOpacity onPress={() => setShowDone(!showDone)}>
            <Text style={s.link}>{showDone ? '只看未修' : '顯示已修的科目'}</Text>
          </TouchableOpacity>
        </Card>
      )}

      {/* 已修課程 */}
      <Card>
        <SectionTitle>已修課程(課表匯入)</SectionTitle>
        {summary.courses.length === 0 ? (
          <Text style={s.hint}>
            「{ownerName}」還沒有課程。到課表頁或用上方「匯入歷年課表」,把每個學期在北科課程好朋友匯出的
            course.json 匯進來(含已修完的學期),就會自動統計學分。
          </Text>
        ) : (
          <Text style={s.hint}>點課程可設為不採計(不及格 / 停修 / 重修舊紀錄)或改類別。</Text>
        )}
        {bySemester.map((g) => {
          const credits = g.items
            .filter((c) => c.status === 'counted')
            .reduce((sum, c) => sum + c.credit, 0);
          return (
            <View key={g.semesterId} style={s.termBlock}>
              <Text style={s.termTitle}>
                {g.semesterId} · {g.items.length} 門 · {fmt(credits)} 學分
              </Text>
              {g.items.map((c) => {
                const dim = c.status !== 'counted';
                return (
                  <TouchableOpacity key={c.key} style={s.courseRow} onPress={() => setAdjusting(c)}>
                    <TypeBadge
                      type={c.type}
                      category={c.category}
                      label={
                        c.status === 'excluded'
                          ? '不採計'
                          : c.status === 'placeholder'
                            ? '占位'
                            : c.status === 'unknown'
                              ? '未分類'
                              : undefined
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[s.courseTitle, dim && s.courseDim, c.status === 'excluded' && s.strike]}
                        numberOfLines={1}
                      >
                        {c.title}
                        {c.overridden ? ' ✎' : ''}
                      </Text>
                      {(c.dimension || c.crossDept || c.reason) && (
                        <Text style={s.courseMeta} numberOfLines={1}>
                          {c.dimension ? `${c.dimension}向度` : ''}
                          {c.crossDept ? `他系(${c.classNames.join('、')})` : ''}
                          {c.status !== 'counted' && c.reason ? c.reason : ''}
                        </Text>
                      )}
                    </View>
                    <Text style={[s.courseCredit, dim && s.courseDim]}>{fmt(c.credit)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </Card>

      {/* 手動學分 */}
      <Card>
        <SectionTitle>手動加入的學分</SectionTitle>
        <Text style={s.hint}>抵免、轉學、暑修、他校課程等課表上沒有的學分。點項目可編輯。</Text>
        {plan.manualCredits.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={s.courseRow}
            onPress={() => {
              setEditingManual(m);
              setManualOpen(true);
            }}
          >
            <TypeBadge category={m.category} />
            <View style={{ flex: 1 }}>
              <Text style={s.courseTitle} numberOfLines={1}>
                {m.title}
              </Text>
              {(m.note || m.dimension) && (
                <Text style={s.courseMeta} numberOfLines={1}>
                  {[m.dimension ? `${m.dimension}向度` : '', m.note ?? ''].filter(Boolean).join(' · ')}
                </Text>
              )}
            </View>
            <Text style={s.courseCredit}>{fmt(m.credit)}</Text>
          </TouchableOpacity>
        ))}
        <Button
          label="＋ 加入學分"
          variant="outline"
          onPress={() => {
            setEditingManual(null);
            setManualOpen(true);
          }}
        />
      </Card>

      {/* 系所規定 */}
      {std && std.rules.length > 0 && (
        <Card>
          <SectionTitle>
            系所規定 {plan.checkedRules.filter((r) => std.rules.includes(r)).length} / {std.rules.length}
          </SectionTitle>
          <Text style={s.hint}>
            學分以外的畢業條件(英文門檻、跨領域學習、指定課群⋯)程式無法自動判斷,請逐條確認後勾起來。
            規定裡提到的課程若已修過,會標在下面。
          </Text>
          {summary.hints.map((h) => {
            const checked = plan.checkedRules.includes(h.rule);
            return (
              <TouchableOpacity key={h.rule} style={s.ruleRow} onPress={() => toggleRule(h.rule)}>
                <Text style={[s.ruleBox, checked && s.ruleBoxOn]}>{checked ? '✓' : ''}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.ruleText, checked && s.ruleTextDone]}>{h.rule}</Text>
                  {h.taken.length > 0 && (
                    <Text style={s.ruleHint}>已修:{h.taken.join('、')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </Card>
      )}

      <Text style={s.footnote}>
        學分歸類依北科課程系統的課程類別符號(○△ 共同必修、☆ 共同選修、●▲ 專業必修、★ 專業選修),
        資料由「北科課程好朋友」(ntut-course.gnehs.net)整理。這是依公開資料的估算,
        抵免、重修、特殊規定請以教務處與系辦的審查為準。
      </Text>

      <GraduationSetupModal
        visible={setupOpen}
        onClose={() => setSetupOpen(false)}
        ownerName={ownerName}
        plan={plan}
        onSave={saveGraduationPlan}
      />
      <ImportCourseModal
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        ownerId={owner}
        onImported={handleImported}
      />
      <CourseAdjustModal
        visible={adjusting !== null}
        onClose={() => setAdjusting(null)}
        course={adjusting}
        plan={plan}
        onSave={saveGraduationPlan}
      />
      <ManualCreditModal
        visible={manualOpen}
        onClose={() => setManualOpen(false)}
        editing={editingManual}
        onSave={saveManual}
        onDelete={deleteManual}
      />
    </ScrollView>
  );
};

const s = StyleSheet.create({
  ownerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: spacing.md },
  ownerLabel: { fontSize: 13, color: colors.textMuted, marginRight: spacing.xs },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.sm },
  stdTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.xs },
  totalNum: { fontSize: 36, fontWeight: '800', lineHeight: 40 },
  totalDenom: { fontSize: 14, color: colors.textMuted, marginBottom: 6 },
  bucket: { marginTop: spacing.md },
  bucketHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  bucketLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
  bucketNum: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  bucketNote: { fontSize: 11, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  dimRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  dimChip: {
    fontSize: 11,
    color: colors.text,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginTop: 4,
  },
  dimChipOk: { backgroundColor: '#DDF3EA', color: colors.success },
  dimChipFree: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  link: { fontSize: 12, color: colors.accent, fontWeight: '600', marginTop: spacing.md },
  warn: { fontSize: 12, color: colors.warning, lineHeight: 18, marginBottom: spacing.xs },
  termBlock: { marginTop: spacing.sm },
  termTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: 2,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reqMark: { width: 22, fontSize: 14, fontWeight: '800' },
  reqDone: { color: colors.success },
  reqTodo: { color: colors.textMuted },
  reqName: { flex: 1, fontSize: 13, color: colors.text },
  reqNameDone: { color: colors.textMuted },
  reqCredit: { width: 28, textAlign: 'right', fontSize: 12, color: colors.textMuted },
  okText: { fontSize: 13, color: colors.success, fontWeight: '600', marginTop: spacing.sm },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  courseTitle: { fontSize: 13, fontWeight: '600', color: colors.text },
  courseMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  courseCredit: { width: 30, textAlign: 'right', fontSize: 13, fontWeight: '700', color: colors.text },
  courseDim: { color: colors.textMuted, fontWeight: '400' },
  strike: { textDecorationLine: 'line-through' },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ruleBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: '#fff',
    marginRight: spacing.sm,
    marginTop: 1,
  },
  ruleBoxOn: { backgroundColor: colors.success, borderColor: colors.success },
  ruleText: { fontSize: 12, color: colors.text, lineHeight: 18 },
  ruleTextDone: { color: colors.textMuted },
  ruleHint: { fontSize: 11, color: colors.success, marginTop: 2 },
  footnote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: spacing.sm },
});

export default GraduationScreen;
