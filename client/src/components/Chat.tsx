import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { rollDice } from '../dice';
import { nanoid } from '../util';
import Icon from './Icon';

export default function Chat() {
  const chat = useStore((s) => s.state.chat);
  const self = useStore((s) => s.self);
  const dispatch = useStore((s) => s.dispatch);
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat.length]);

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setText('');

    // dice command: /r 2d6+3  or /roll d20
    const command = value.match(/^\/(?:r|roll)\s+(.+)$/i);
    if (command) {
      const result = rollDice(command[1]);
      if (result) {
        dispatch({
          kind: 'chat.add',
          message: {
            id: nanoid(),
            author: self.name,
            color: self.color,
            text: `${result.formula} = ${result.total}  ${result.breakdown}`,
            ts: Date.now(),
          },
        });
      } else {
        dispatch({
          kind: 'chat.add',
          message: {
            id: nanoid(),
            author: 'System',
            color: '#fbbf24',
            text: `Invalid dice expression: "${command[1]}". Try /r 2d6+3`,
            ts: Date.now(),
            system: true,
          },
        });
      }
      return;
    }

    dispatch({
      kind: 'chat.add',
      message: { id: nanoid(), author: self.name, color: self.color, text: value, ts: Date.now() },
    });
  };

  return (
    <div className="panel chat">
      <div className="panel-head">
        <Icon name="chat" size={14} />
        <span>Chat y dados</span>
        <span className="grow" />
        <button onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Expandir' : 'Contraer'}>
          {collapsed ? '▾' : '▴'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="chat-log" ref={logRef}>
            {chat.length === 0 && (
              <p className="hint">
                Escribe un mensaje, o <code>/r 2d6+3</code> para tirar dados.
              </p>
            )}
            {chat.map((m) => (
              <div key={m.id} className={`chat-msg ${m.system ? 'system' : ''}`}>
                {!m.system && (
                  <span className="author" style={{ color: m.color }}>
                    {m.author}:
                  </span>
                )}
                <span>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={text}
              placeholder="Mensaje o /r 2d6+3"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <button className="btn primary" onClick={submit}>
              Enviar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
