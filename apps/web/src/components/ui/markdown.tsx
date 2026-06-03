import { cn } from '@/lib/utils'
import { marked } from 'marked'
import { memo, useId, useMemo } from 'react'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { CodeBlock, CodeBlockCode } from './code-block'

export type MarkdownProps = {
  children: string
  id?: string
  className?: string
  components?: Partial<Components>
}

function parseMarkdownIntoBlocks(markdown: string): string[] {
  const tokens = marked.lexer(markdown)
  return tokens.map((token) => token.raw)
}

function extractLanguage(className?: string): string {
  if (!className) return 'plaintext'
  const match = className.match(/language-(\w+)/)
  return match?.[1] ?? 'plaintext'
}

const INITIAL_COMPONENTS: Partial<Components> = {
  h1: function H1Component({ className, ...props }) {
    return (
      <h1
        className={cn(
          'mb-3 mt-1 text-xl font-semibold leading-7 tracking-normal first:mt-0',
          className,
        )}
        {...props}
      />
    )
  },
  h2: function H2Component({ className, ...props }) {
    return (
      <h2
        className={cn(
          'mb-2.5 mt-3 text-base font-semibold leading-6 tracking-normal first:mt-0',
          className,
        )}
        {...props}
      />
    )
  },
  h3: function H3Component({ className, ...props }) {
    return (
      <h3
        className={cn(
          'mb-2 mt-2.5 text-sm font-semibold leading-5 tracking-normal first:mt-0',
          className,
        )}
        {...props}
      />
    )
  },
  p: function ParagraphComponent({ className, ...props }) {
    return <p className={cn('my-1.5 leading-6', className)} {...props} />
  },
  a: function AnchorComponent({ className, ...props }) {
    return (
      <a
        className={cn(
          'font-medium text-current underline underline-offset-2',
          className,
        )}
        target="_blank"
        rel="noreferrer"
        {...props}
      />
    )
  },
  blockquote: function BlockquoteComponent({ className, ...props }) {
    return (
      <blockquote
        className={cn(
          'my-2 border-l-2 border-current/30 pl-3 text-current opacity-85',
          className,
        )}
        {...props}
      />
    )
  },
  hr: function HorizontalRuleComponent({ className, ...props }) {
    return (
      <hr
        className={cn('my-3 border-0 border-t border-border/70', className)}
        {...props}
      />
    )
  },
  ul: function UnorderedListComponent({ className, ...props }) {
    return (
      <ul
        className={cn('my-2 list-disc pl-5 leading-6', className)}
        {...props}
      />
    )
  },
  ol: function OrderedListComponent({ className, ...props }) {
    return (
      <ol
        className={cn('my-2 list-decimal pl-5 leading-6', className)}
        {...props}
      />
    )
  },
  li: function ListItemComponent({ className, ...props }) {
    return <li className={cn('my-0.5 pl-1', className)} {...props} />
  },
  table: function TableComponent({ className, ...props }) {
    return (
      <div className="my-2 w-full overflow-x-auto rounded-md border border-border/70">
        <table
          className={cn(
            'm-0 w-full border-collapse text-left text-sm leading-6',
            className,
          )}
          {...props}
        />
      </div>
    )
  },
  tr: function TableRowComponent({ className, ...props }) {
    return (
      <tr
        className={cn('border-b border-border/50 last:border-b-0', className)}
        {...props}
      />
    )
  },
  th: function TableHeadComponent({ className, ...props }) {
    return (
      <th
        className={cn(
          'border-b border-border/70 bg-muted/40 px-2.5 py-1.5 font-semibold text-current',
          className,
        )}
        {...props}
      />
    )
  },
  td: function TableCellComponent({ className, ...props }) {
    return (
      <td
        className={cn('px-2.5 py-1.5 align-top text-current', className)}
        {...props}
      />
    )
  },
  code: function CodeComponent({ className, children, ...props }) {
    const isInline =
      !props.node?.position?.start.line ||
      props.node?.position?.start.line === props.node?.position?.end.line

    if (isInline) {
      return (
        <span
          className={cn(
            'rounded-sm bg-current/10 px-1 font-mono text-sm text-current',
            className,
          )}
          {...props}
        >
          {children}
        </span>
      )
    }

    const language = extractLanguage(className)

    return (
      <CodeBlock className={className}>
        <CodeBlockCode code={children as string} language={language} />
      </CodeBlock>
    )
  },
  pre: function PreComponent({ children }) {
    return <>{children}</>
  },
}

const MemoizedMarkdownBlock = memo(
  function MarkdownBlock({
    content,
    components = INITIAL_COMPONENTS,
  }: {
    content: string
    components?: Partial<Components>
  }) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    )
  },
  function propsAreEqual(prevProps, nextProps) {
    return prevProps.content === nextProps.content
  },
)

MemoizedMarkdownBlock.displayName = 'MemoizedMarkdownBlock'

function MarkdownComponent({
  children,
  id,
  className,
  components = INITIAL_COMPONENTS,
}: MarkdownProps) {
  const generatedId = useId()
  const blockId = id ?? generatedId
  const blocks = useMemo(() => parseMarkdownIntoBlocks(children), [children])

  return (
    <div className={className}>
      {blocks.map((block, index) => (
        <MemoizedMarkdownBlock
          key={`${blockId}-block-${index}`}
          content={block}
          components={components}
        />
      ))}
    </div>
  )
}

const Markdown = memo(MarkdownComponent)
Markdown.displayName = 'Markdown'

export { Markdown }
