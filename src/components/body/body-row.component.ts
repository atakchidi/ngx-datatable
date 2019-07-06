import {
  Component, Input, HostBinding, ElementRef, Output, KeyValueDiffers, KeyValueDiffer,
  EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef, DoCheck, SkipSelf, Renderer2, OnDestroy
} from '@angular/core';

import {
  columnsByPin, columnGroupWidths, columnsByPinArr, translateXY, Keys
} from '../../utils';
import { ActivateHelperService, ScrollbarHelper } from '../../services';
import { TableActivateEvent, TableActivateEventType, TreeStatus } from '../../index';

@Component({
  selector: 'datatable-body-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      *ngFor="let colGroup of _columnsByPin; let i = index; trackBy: trackByGroups"
      class="datatable-row-{{colGroup.type}} datatable-row-group"
      [ngStyle]="_groupStyles[colGroup.type]">
      <datatable-body-cell
        *ngFor="let column of colGroup.columns; let ii = index; trackBy: columnTrackingFn"
        tabindex="-1"
        [row]="row"
        [group]="group"
        [expanded]="expanded"
        [isSelected]="isSelected"
        [rowIndex]="rowIndex"
        [column]="column"
        [rowHeight]="rowHeight"
        [displayCheck]="displayCheck"
        [treeStatus]="treeStatus"
        (activate)="onActivate($event, ii)"
        (treeAction)="onTreeAction()">
      </datatable-body-cell>
    </div>
  `
})
export class DataTableBodyRowComponent implements DoCheck, OnDestroy {

  @Input() set columns(val: any[]) {
    this._columns = val;
    this.recalculateColumns(val);
    this.buildStylesByGroup();
  }

  get columns(): any[] {
    return this._columns;
  }

  @Input() set innerWidth(val: number) {
    if (this._columns) {
      const colByPin = columnsByPin(this._columns);
      this._columnGroupWidths = columnGroupWidths(colByPin, colByPin);
    }

    this._innerWidth = val;
    this.recalculateColumns();
    this.buildStylesByGroup();
  }

  get innerWidth(): number {
    return this._innerWidth;
  }

  @Input() expanded: boolean;
  @Input() rowClass: any;
  @Input() row: any;
  @Input() group: any;
  @Input() isSelected: boolean;
  @Input() rowIndex: number;
  @Input() displayCheck: any;
  @Input() treeStatus: TreeStatus = 'collapsed';

  @Input()
  set offsetX(val: number) {
    this._offsetX = val;
    this.buildStylesByGroup();
  }
  get offsetX() { return this._offsetX; }

  @HostBinding('class')
  get cssClass() {
    let cls = 'datatable-body-row';
    if (this.isSelected) cls += ' active';
    if (this.rowIndex % 2 !== 0) cls += ' datatable-row-odd';
    if (this.rowIndex % 2 === 0) cls += ' datatable-row-even';

    if (this.rowClass) {
      const res = this.rowClass(this.row);
      if (typeof res === 'string') {
        cls += ` ${res}`;
      } else if (typeof res === 'object') {
        const keys = Object.keys(res);
        for (const k of keys) {
          if (res[k] === true) cls += ` ${k}`;
        }
      }
    }

    return cls;
  }

  @HostBinding('style.height.px')
  @Input() rowHeight: number;

  @HostBinding('style.width.px')
  get columnsTotalWidths(): string {
    return this._columnGroupWidths.total;
  }

  @Output() activate: EventEmitter<TableActivateEvent> = new EventEmitter();
  @Output() treeAction: EventEmitter<any> = new EventEmitter();

  _element: any;
  _columnGroupWidths: any;
  _columnsByPin: any;
  _offsetX: number;
  _columns: any[];
  _innerWidth: number;
  _groupStyles: {[prop: string]: {}} = {
    left: {},
    center: {},
    right: {}
  };

  private _rowDiffer: KeyValueDiffer<{}, {}>;
  private _listeners: Array<() => void> = [];

  constructor(
      private differs: KeyValueDiffers,
      @SkipSelf() private scrollbarHelper: ScrollbarHelper,
      private cd: ChangeDetectorRef,
      element: ElementRef,
      private activateEventHelper: ActivateHelperService,
      private renderer: Renderer2) {
    this._element = element.nativeElement;
    this._rowDiffer = differs.find({}).create();
    this.registerEvents();
  }

  ngDoCheck(): void {
    if (this._rowDiffer.diff(this.row)) {
      this.cd.markForCheck();
    }
  }

  ngOnDestroy() {
    this._listeners.forEach(l => l());
  }

  trackByGroups(index: number, colGroup: any): any {
    return colGroup.type;
  }

  columnTrackingFn(index: number, column: any): any {
    return column.$$id;
  }

  buildStylesByGroup() {
    this._groupStyles.left = this.calcStylesByGroup('left');
    this._groupStyles.center = this.calcStylesByGroup('center');
    this._groupStyles.right = this.calcStylesByGroup('right');
    this.cd.markForCheck();
  }

  calcStylesByGroup(group: string) {
    const widths = this._columnGroupWidths;
    const offsetX = this.offsetX;

    const styles = {
      width: `${widths[group]}px`
    };

    if (group === 'left') {
      translateXY(styles, offsetX, 0);
    } else if (group === 'right') {
      const bodyWidth = parseInt(this.innerWidth + '', 0);
      const totalDiff = widths.total - bodyWidth;
      const offsetDiff = totalDiff - offsetX;
      const offset = (offsetDiff + this.scrollbarHelper.width) * -1;
      translateXY(styles, offset, 0);
    }

    return styles;
  }

  onActivate(event: TableActivateEvent, index: number): void {
    event.cellIndex = index;
    event.rowElement = this._element;
    this.activate.emit(event);
  }

  recalculateColumns(val: any[] = this.columns): void {
    this._columns = val;
    const colsByPin = columnsByPin(this._columns);
    this._columnsByPin = columnsByPinArr(this._columns);
    this._columnGroupWidths = columnGroupWidths(colsByPin, this._columns);
  }

  onTreeAction() {
    this.treeAction.emit();
  }

  private registerEvents(): void {
    const events: TableActivateEventType[] = ['mouseenter', 'keydown'];

    for (const type of events) {
      if (!this.activateEventHelper.isAllowed(type)) {
        continue;
      }

      this._listeners.push(this.renderer.listen(this._element, type, event => {
        let emit = true;

        if (type === 'keydown') {
          const keyCode = event.keyCode;
          const isTargetCell = event.target === this._element;

          const isAction =
            keyCode === Keys.return ||
            keyCode === Keys.down ||
            keyCode === Keys.up ||
            keyCode === Keys.left ||
            keyCode === Keys.right;

          emit = isAction && isTargetCell;
          if (emit) {
            event.preventDefault();
            event.stopPropagation();
          }
        }

        if (!emit) {
          return;
        }

        this.activate.emit({
          type,
          event,
          row: this.row,
          rowElement: this._element
        });

      }));
    }
  }
}
